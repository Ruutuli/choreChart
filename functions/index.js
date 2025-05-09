const functions = require('firebase-functions');
const {defineSecret} = require("firebase-functions/params");
const {setGlobalOptions} = require("firebase-functions/v2");
const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

// Initialize Firebase Admin
admin.initializeApp();

// Define secrets for EmailJS
const emailjsPublicKey = defineSecret("EMAILJS_PUBLIC_KEY");
const emailjsPrivateKey = defineSecret("EMAILJS_PRIVATE_KEY");

// Set global options for all functions
setGlobalOptions({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 540
});

// Initialize EmailJS with your credentials
emailjs.init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY || "2Y5bZw5v4twj7OYMV",
  privateKey: process.env.EMAILJS_PRIVATE_KEY || "PAH5B4451FgXI2kAFn-s8",
  limitRate: true,
  blockHeadless: false
});

// Helper to check if a frequency needs reset
const needsReset = (frequency, lastReset) => {
  if (!lastReset) return true;
  const lastDate = new Date(lastReset);
  const today = new Date();
  
  switch (frequency) {
    case "daily":
      return lastDate.toDateString() !== today.toDateString();
    case "weekly":
      return today.getDay() === 0 && lastDate.toDateString() !== today.toDateString();
    case "biweekly":
      const weekNumber = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(today.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000)) + 1;
      return today.getDay() === 0 && weekNumber % 2 === 0 && lastDate.toDateString() !== today.toDateString();
    case "monthly":
      return today.getDate() === 1 && lastDate.toDateString() !== today.toDateString();
    case "quarterly":
      return today.getDate() === 1 && [0, 3, 6, 9].includes(today.getMonth()) && 
        lastDate.toDateString() !== today.toDateString();
    default:
      return false;
  }
};

// Helper to log activity with retry
const logActivity = async (householdId, entry, retries = 3) => {
  // Clean the entry object by removing undefined values
  const cleanEntry = Object.fromEntries(
    Object.entries(entry).filter(([_, value]) => value !== undefined)
  );

  for (let i = 0; i < retries; i++) {
    try {
      const logRef = admin.firestore().collection('households').doc(householdId).collection('logs').doc();
      await logRef.set({
        ...cleanEntry,
        time: cleanEntry.time || new Date().toISOString()
      });
      console.log("📝 Logged to Firestore:", cleanEntry);
      return;
    } catch (err) {
      console.error(`❌ Failed to log activity (attempt ${i + 1}/${retries}):`, err);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
};

// Helper to reassign rotating chores
const reassignRotatingChores = async (people, choreData) => {
  console.log("🔄 Starting reassignRotatingChores");
  console.log("Input choreData:", JSON.stringify(choreData, null, 2));
  
  if (!Array.isArray(choreData.rotating)) {
    console.log("❌ No rotating chores array found");
    return { updatedPeople: people, updatedRotating: [] };
  }

  const peopleIds = people.map(p => p.id);
  console.log("👥 People IDs:", peopleIds);
  
  const grouped = {
    daily: [],
    weekly: [],
    biweekly: [],
    monthly: [],
    quarterly: []
  };

  // Group chores by type
  for (const chore of choreData.rotating) {
    if (grouped[chore.type]) {
      grouped[chore.type].push(chore);
      console.log(`📝 Added ${chore.type} chore:`, chore);
    }
  }

  console.log("📊 Grouped chores:", JSON.stringify(grouped, null, 2));

  // Shuffle each group
  for (const type in grouped) {
    grouped[type] = grouped[type].sort(() => Math.random() - 0.5);
  }

  const assigned = Object.fromEntries(peopleIds.map(id => [id, []]));
  const alreadyAssignedNames = new Set();

  // Helper to assign a single chore
  function assignChore(chore, personId) {
    if (!alreadyAssignedNames.has(chore.task)) {
      alreadyAssignedNames.add(chore.task);
      assigned[personId].push({ 
        ...chore,
        name: chore.task,
        people: [personId],
        origin: "rotating"
      });
      return true;
    }
    return false;
  }

  // First pass: Assign one daily chore to each person
  for (const personId of peopleIds) {
    const dailyChore = grouped.daily.find(c => !alreadyAssignedNames.has(c.task));
    if (dailyChore) {
      assignChore(dailyChore, personId);
    }
  }

  // Second pass: Assign one biweekly chore to each person
  for (const personId of peopleIds) {
    const biweeklyChore = grouped.biweekly.find(c => !alreadyAssignedNames.has(c.task));
    if (biweeklyChore) {
      assignChore(biweeklyChore, personId);
    }
  }

  // Third pass: Assign one weekly chore to each person
  for (const personId of peopleIds) {
    const weeklyChore = grouped.weekly.find(c => !alreadyAssignedNames.has(c.task));
    if (weeklyChore) {
      assignChore(weeklyChore, personId);
    }
  }

  // Fourth pass: Fill remaining slots to reach 4 chores per person
  for (const personId of peopleIds) {
    while (assigned[personId].length < 4) {
      // Try monthly first
      const monthlyChore = grouped.monthly.find(c => !alreadyAssignedNames.has(c.task));
      if (monthlyChore) {
        assignChore(monthlyChore, personId);
        continue;
      }

      // Then try weekly
      const weeklyChore = grouped.weekly.find(c => !alreadyAssignedNames.has(c.task));
      if (weeklyChore) {
        assignChore(weeklyChore, personId);
        continue;
      }

      // Finally try biweekly
      const biweeklyChore = grouped.biweekly.find(c => !alreadyAssignedNames.has(c.task));
      if (biweeklyChore) {
        assignChore(biweeklyChore, personId);
        continue;
      }

      // If we can't find any more chores, break
      break;
    }
  }

  // Log assignment results
  console.log("\n📋 Assignment Results:");
  for (const personId of peopleIds) {
    console.log(`${personId}: ${assigned[personId].length} chores`);
    assigned[personId].forEach(chore => {
      console.log(`  - ${chore.task} (${chore.type})`);
    });
  }

  // Update people with new chores
  const updatedPeople = people.map(person => ({
    ...person,
    chores: [
      ...(person.chores || []).filter(c => c.origin === "permanent"),
      ...assigned[person.id].map(c => ({
        task: c.task,
        name: c.task,
        type: c.type,
        people: c.people,
        origin: "rotating"
      }))
    ]
  }));

  // Create updated rotating chores list
  const updatedRotating = Object.values(assigned).flat().map(c => ({
    task: c.task,
    name: c.task,
    type: c.type,
    people: c.people,
    origin: "rotating"
  }));

  return { updatedPeople, updatedRotating };
};

// Helper to execute batch with retry
const executeBatchWithRetry = async (batch, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      await batch.commit();
      return;
    } catch (err) {
      console.error(`❌ Batch commit failed (attempt ${i + 1}/${retries}):`, err);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
};

// Main scheduled function that runs daily at midnight
exports.scheduledChoreReset = functions.pubsub.schedule('0 0 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const householdId = "myHouseholdId";
    const db = admin.firestore();

    try {
      // Get current state
      const householdRef = db.collection('households').doc(householdId);
      const householdDoc = await householdRef.get();
      
      if (!householdDoc.exists) {
        console.log("❌ Household not found:", householdId);
        return null;
      }

      const data = householdDoc.data();
      let people = data.people || [];
      
      // Load rotating chores from data.json
      const rotatingChores = [
        { task: "Dishes", type: "daily" },
        { task: "Trash", type: "daily" },
        { task: "Kitchen Counter Wipe", type: "daily" },
        { task: "Empty Roomba", type: "daily" },
        { task: "Clean Trim Dining Room", type: "monthly" },
        { task: "Sweep Laundry Room", type: "weekly" },
        { task: "Mop Laundry Room", type: "biweekly" },
        { task: "Clean Laundry Room", type: "weekly" },
        { task: "Clean Entryway Rugs", type: "biweekly" },
        { task: "Sweep Kitchen", type: "weekly" },
        { task: "Mop Kitchen", type: "weekly" },
        { task: "Clean Trim Kitchen", type: "monthly" },
        { task: "Clean Kitchen Sink", type: "weekly" },
        { task: "Clean Out Pantry", type: "biweekly" },
        { task: "Clean Out Fridge", type: "biweekly" },
        { task: "Garage Trash Out", type: "weekly" }
      ];

      const choreData = {
        ...data.chores,
        rotating: rotatingChores
      };

      // Add debug logging
      console.log("🔍 Debug - Chore Data:", JSON.stringify(choreData, null, 2));
      console.log("🔍 Debug - People Data:", JSON.stringify(people, null, 2));

      // Get last reset timestamps
      const metaRef = db.collection('meta').doc('lastReset');
      const metaDoc = await metaRef.get();
      const existing = metaDoc.exists ? metaDoc.data() : {};
      const now = new Date();
      const nowISO = now.toISOString();
      const updates = {};

      // Track which frequencies need reset
      const frequencies = ["daily", "weekly", "biweekly", "monthly", "quarterly"];
      const needsResetMap = {};
      frequencies.forEach(freq => {
        needsResetMap[freq] = needsReset(freq, existing[freq]);
      });

      // If nothing needs reset, return early
      if (!Object.values(needsResetMap).some(Boolean)) {
        console.log("✅ No resets needed");
        return null;
      }

      // Process each person's chores
      for (const person of people) {
        const missedChores = [];
        const completedToKeep = [];

        // Check each chore
        for (const chore of (person.chores || [])) {
          const type = chore.type?.toLowerCase();
          if (!type) continue;

          // If this frequency needs reset
          if (needsResetMap[type]) {
            // If not completed, add to missed
            if (!person.completed?.includes(chore.name)) {
              missedChores.push(chore);
            }
          } else {
            // Keep completed chores that don't need reset
            if (person.completed?.includes(chore.name)) {
              completedToKeep.push(chore.name);
            }
          }
        }

        // Update person's state
        if (missedChores.length > 0) {
          person.dollarsOwed = (person.dollarsOwed || 0) + missedChores.length;
          person.paid = false;

          try {
            // Only log if we have valid data
            if (person.name && missedChores.length > 0) {
              const validChores = missedChores
                .map(c => c.name)
                .filter(name => name !== undefined && name !== null);
              
              if (validChores.length > 0) {
                await logActivity(householdId, {
                  type: "missedChores",
                  person: person.name,
                  amount: missedChores.length,
                  chores: validChores
                });
              }
            }
          } catch (err) {
            console.error("❌ Failed to log missed chores:", err);
            // Continue execution even if logging fails
          }
        }

        // Update completed list
        person.completed = completedToKeep;
      }

      // Handle resets based on frequency
      if (needsResetMap.daily || needsResetMap.weekly || needsResetMap.biweekly || 
          needsResetMap.monthly || needsResetMap.quarterly) {
        console.log("🔁 Reassigning rotating chores");
        const { updatedPeople, updatedRotating } = await reassignRotatingChores(people, choreData);
        people = updatedPeople;
        choreData.rotating = updatedRotating;
      }

      // Update timestamps
      frequencies.forEach(freq => {
        if (needsResetMap[freq]) {
          updates[freq] = nowISO;
        }
      });

      // Save all changes
      const batch = db.batch();
      
      // Update household data
      batch.update(householdRef, { 
        people,
        chores: {
          ...choreData,
          rotating: choreData.rotating
        }
      });
      
      // Update reset timestamps
      batch.set(metaRef, { ...existing, ...updates }, { merge: true });
      
      try {
        await executeBatchWithRetry(batch);
        console.log("✅ Reset completed successfully");
      } catch (err) {
        console.error("❌ Failed to save changes after multiple retries:", err);
        throw err;
      }

      return null;
    } catch (error) {
      console.error("❌ Error during reset:", error);
      throw error;
    }
  });

// Function to send morning SMS to all people
// Test deployment - May 8, 2024 - Force redeploy
exports.sendMorningSMS = functions.pubsub.schedule('0 8 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log("📱 Starting sendMorningSMS function");
    const householdId = "myHouseholdId";
    const db = admin.firestore();

    try {
      // Get household data
      const householdRef = db.collection('households').doc(householdId);
      const householdDoc = await householdRef.get();
      
      if (!householdDoc.exists) {
        console.log("❌ Household not found:", householdId);
        return null;
      }

      const data = householdDoc.data();
      const people = data.people || [];
      console.log(`👥 Found ${people.length} people in household`);

      // Check if SMS was already sent today
      const metaRef = db.collection('meta').doc('lastSMS');
      const metaDoc = await metaRef.get();
      const todayStr = new Date().toISOString().split('T')[0];
      
      if (metaDoc.exists && metaDoc.data().date === todayStr) {
        console.log("📪 Morning SMS already sent today");
        return null;
      }

      // Send SMS to each person
      for (const person of people) {
        console.log(`📱 Processing SMS for ${person.name}`);
        const todayChores = (person.chores || []).filter(c => {
          const t = c.type?.toLowerCase();
          return ["daily", "weekly", "biweekly"].includes(t);
        });

        console.log(`📋 Found ${todayChores.length} chores for today`);

        if (todayChores.length === 0) {
          console.log(`⏭️ Skipping ${person.name} - no chores for today`);
          continue;
        }

        const formattedList = todayChores.map(c => `• ${c.name} (${c.type})`).join("\n");
        const rawNumber = person.phone ?? "";
        const rawCarrier = person.carrier ?? "";
        const number = rawNumber.replace(/\D/g, "");
        const carrierSuffix = carrierGateways[rawCarrier];

        console.log(`📱 Phone info for ${person.name}:`, {
          rawNumber,
          rawCarrier,
          number,
          carrierSuffix
        });

        if (!number || !carrierSuffix) {
          console.warn(`📵 Skipping SMS: missing number or carrier for ${person.name}`);
          continue;
        }

        const to_email = `${number}${carrierSuffix}`;
        const freqSet = new Set(todayChores.map(c => c.type?.toLowerCase()));
        const frequency = freqSet.size === 1
          ? Array.from(freqSet)[0]?.replace(/^\w/, l => l.toUpperCase())
          : "Mixed";

        const date_range = getDateRange(frequency);

        console.log(`📤 Attempting to send SMS to ${person.name} at ${to_email}`);

        try {
          await emailjs.send("service_v8ndidp", "template_53xar2k", {
            to_email,
            name: person.name,
            chore_list: formattedList,
            dollars: person.dollarsOwed || 0,
            frequency,
            date_range,
            site_url: "https://ruutuli.github.io/choreChart/"
          });
          console.log(`✅ SMS sent to ${person.name}`);
        } catch (err) {
          console.error(`❌ Failed to send SMS to ${person.name}:`, err);
        }
      }

      // Update last SMS timestamp
      await metaRef.set({ date: todayStr });
      console.log(`✅ SMS sent logged in Firestore as ${todayStr}`);

      return null;
    } catch (error) {
      console.error("❌ Error in sendMorningSMS:", error);
      return null;
    }
  });

// Helper function to get date range for SMS
function getDateRange(frequency) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (frequency === "Daily") {
    return formatDate(today);
  }

  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return `${formatDate(start)} – ${formatDate(end)}`;
}

// Helper function to format date
function formatDate(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Carrier gateways for SMS
const carrierGateways = {
  "Verizon": "@vtext.com",
  "AT&T": "@txt.att.net",
  "T-Mobile": "@tmomail.net",
  "Sprint": "@messaging.sprintpcs.com",
  "Google Fi": "@msg.fi.google.com"
}; 