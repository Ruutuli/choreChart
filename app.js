/* ============================================================================
 00. Main File Skeleton for app.js
============================================================================ */

// ============================================================================
// ------------------- Reminder & SMS Tools -------------------
// EmailJS config, SMS/email reminder logic, 8AM daily auto-text
// ============================================================================

// ------------------- Function: sendChoreEmail -------------------
// Sends a chore summary email to the person
function sendChoreEmail(person) {
  const todayChores = (person.chores || []).filter(c => {
    const t = c.type?.toLowerCase();
    return ["daily", "weekly", "biweekly"].includes(t);
  });

  if (todayChores.length === 0) return;

  const formattedList = todayChores.map(c => `• ${c.name} (${c.type})`).join("\n");

  const freqSet = new Set(todayChores.map(c => c.type?.toLowerCase()));
  const frequency = freqSet.size === 1
    ? Array.from(freqSet)[0]?.replace(/^\w/, l => l.toUpperCase())
    : "Mixed";

  sendChoreSMS(person, formattedList, frequency);
}

// ------------------- Function: sendChoreSMS -------------------
// Sends an SMS (via email gateway) containing chores
function sendChoreSMS(person, message) {
  const rawNumber = person.phone ?? "";
  const rawCarrier = person.carrier ?? "";
  const number = rawNumber.replace(/\D/g, "");
  const carrierSuffix = carrierGateways[rawCarrier];

  if (!number || !carrierSuffix) {
    console.warn(`📵 Skipping SMS: missing number or carrier for ${person.name}`);
    return;
  }

  const to_email = `${number}${carrierSuffix}`;
  const formattedList = (person.chores || [])
    .map(c => `• ${c.name} (${c.type})`).join("\n") || "No chores listed";

  const freqSet = new Set((person.chores || []).map(c => c.type?.toLowerCase()));
  const frequency = freqSet.size === 1
    ? Array.from(freqSet)[0]?.replace(/^\w/, l => l.toUpperCase())
    : "Mixed";

  const date_range = getDateRange(frequency);

  emailjs.send("service_v8ndidp", "template_53xar2k", {
    to_email,
    name: person.name,
    chore_list: formattedList,
    dollars: person.dollarsOwed || 0,
    frequency,
    date_range,
    site_url: "https://ruutuli.github.io/choreChart/"
  }).then(() => {
    console.log(`✅ SMS sent to ${person.name}`);
  }).catch(err => {
    console.error(`❌ Failed to send SMS to ${person.name}`, err);
  });
}

// ------------------- Function: getDateRange -------------------
// Returns formatted range depending on chore frequency
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

// ------------------- Function: shouldSendMorningText -------------------
// Checks if the 8AM SMS was already sent today using Firestore
async function shouldSendMorningText() {
  const now = new Date();
  const hours = now.getHours();
  const todayStr = now.toISOString().split("T")[0];

  try {
    const docRef = window.doc(window.db, "meta", "lastSMS");
    const docSnap = await window.getDoc(docRef);
    const lastSent = docSnap.exists() ? docSnap.data().date : null;

    return hours >= 8 && lastSent !== todayStr;
  } catch (err) {
    console.error("❌ Failed to check lastSMS in Firestore:", err);
    return false;
  }
}

// ------------------- Function: triggerDailySMS -------------------
// Triggers SMS to all people at 8AM daily using Firestore
async function triggerDailySMS() {
  const shouldSend = await shouldSendMorningText();
  if (!shouldSend) {
    console.log("📪 Morning SMS already sent today or too early.");
    return;
  }

  const timestamp = new Date().toLocaleString();
  console.log(`📤 Sending 8AM SMS to all people at ${timestamp}...`);

  people.forEach(p => {
    console.log(`📨 Sending SMS to ${p.name} (${p.phone || p.email || p.id || "No contact info"})`);
    sendChoreEmail(p);
  });

  const todayStr = new Date().toISOString().split("T")[0];
  try {
    const docRef = window.doc(window.db, "meta", "lastSMS");
    await window.setDoc(docRef, { date: todayStr });
    console.log(`✅ SMS sent logged in Firestore as ${todayStr}`);
  } catch (err) {
    console.error("❌ Failed to save lastSMS in Firestore:", err);
  }
}


// 🔁 Check every 10 minutes
setInterval(triggerDailySMS, 10 * 60 * 1000);

// ✅ Also trigger on initial page load if past 8AM
window.addEventListener("load", triggerDailySMS);


// ============================================================================
// ------------------- Data Persistence & Utilities -------------------
// Handles saving to local storage and syncing to Firebase
// ============================================================================

// ------------------- Function: debouncedFirebaseSave -------------------
// Saves data to Firebase with debounce delay
let saveTimeout = null;
function debouncedFirebaseSave(delay = 1000) {
  clearTimeout(saveTimeout);

  saveTimeout = setTimeout(() => {
    window.saveChoreData("myHouseholdId", { people })
      .then(() => {
        console.log("[Firebase]: ✅ Data synced");
        updateLastUpdatedText(); // ✅ ADD HERE
        showCustomAlert("✅ Changes saved");
      })
      .catch(err => {
        console.error("[Firebase]: ❌ Save failed", err);
        updateLastUpdatedText(); // ✅ ADD HERE
        showCustomAlert("⚠️ Failed to sync with cloud");
      });
  }, delay);
}


// ============================================================================
// ------------------- Time & Cycle Logic -------------------
// Week-based resets, auto-trigger control
// ============================================================================

// ------------------- Function: getStartOfWeek -------------------
// Returns ISO string of current week's start (Sunday)
const getStartOfWeek = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // Sunday = 0
  const diff = now.getDate() - dayOfWeek;
  const sunday = new Date(now.setDate(diff));
  sunday.setHours(0, 0, 0, 0);
  return sunday.toISOString().split("T")[0];
};

// ------------------- Function: isBiweeklyWeek -------------------
// Returns true if this is a biweekly reset week
const isBiweeklyWeek = () => {
  const anchorSunday = new Date("2024-01-07T00:00:00"); // first-ever chore week
  const now = new Date();
  const diffWeeks = Math.floor((now - anchorSunday) / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks % 2 === 0;
};

// ------------------- Function: updateChoreCycleStartDate -------------------
// Updates stored chore cycle start for weekly tracking
const updateChoreCycleStartDate = async () => {
  const currentStart = getStartOfWeek();
  await saveSettings({ choreStart: currentStart });
};

// ------------------- Firebase Helper: Ensure Reset Timestamps Exist -------------------
async function initializeResetTimestamps() {
  const docRef = window.doc(window.db, "meta", "lastReset");
  const snapshot = await window.getDoc(docRef);
  const existing = snapshot.exists() ? snapshot.data() : null;

  if (!existing) {
    const now = new Date().toISOString();
    const defaults = {
      daily: now,
      weekly: now,
      biweekly: now,
      monthly: now,
      quarterly: now
    };
    await window.setDoc(docRef, defaults);
    console.log("🧱 Initialized meta/lastReset in Firestore");
  } else {
    console.log("📦 Firestore meta/lastReset already exists:", existing);
  }
}



// ============================================================================
// ------------------- Admin Tools & Modals -------------------
// Modals for dollar editing, skipping, and chore overrides
// ============================================================================

// ------------------- Function: previewReset -------------------
// Displays a visual preview of reset impact
function previewReset() {
  const preview = people.map(p => {
    return `${p.name}: Would keep ${p.completed.length} tasks, reset owed if unpaid`;
  }).join("\n");

  showCustomAlert("Reset Preview:\n\n" + preview);
}

// ------------------- Function: applyDollarAdjustment -------------------
// Updates a user's owed amount
function applyDollarAdjustment() {
  const name = document.getElementById("adminDollarSelect").value;
  const amount = parseFloat(document.getElementById("adminDollarInput").value);

  if (!name || isNaN(amount)) return showCustomAlert("⚠️ Select a person and enter a valid amount.");

  const person = people.find(p => p.name === name);
  if (person) {
    person.dollarsOwed = amount;
    person.paid = amount === 0;
    savePeople();
    debouncedFirebaseSave();
    
    showCustomAlert(`💵 Updated ${name}'s owed amount to $${amount}`);
  }
}

// ------------------- Function: applySkipChore -------------------
// Adds a skip log for a user
function applySkipChore() {
  const name = document.getElementById("skipPersonSelect").value;
  const duration = document.getElementById("skipDurationSelect").value;
  const reason = document.getElementById("skipReasonSelect").value;

  const person = people.find(p => p.name === name);
  if (!person) return showCustomAlert("⚠️ No person selected.");

// Log the skip event to Firestore instead of localStorage
logActivity({
  type: "skipped",
  person: name,
  duration,
  reason,
  time: new Date().toISOString()
});


  // Store skip record (optional future use)
  if (!person.skipLog) person.skipLog = [];
  person.skipLog.push(log);

  savePeople();
  debouncedFirebaseSave();
  
  showCustomAlert(`💤 ${name}'s chores skipped for ${duration} (${reason})`);
}

// ------------------- Function: forceReassignChores -------------------
// Logs reassignment activity (manual trigger)
const forceReassignChores = () => {
  logActivity({ type: "reassigned", triggeredBy: "admin" });
  showCustomAlert("🔄 Chores reassigned.");
  
};

// ============================================================================
// ------------------- UI Rendering -------------------
// Builds dashboard, and history from data
// ============================================================================

// ------------------- Function: renderDashboard -------------------
// Renders chore dashboard for all users
const renderDashboard = () => {
  // ------------------- Hide History / Show Dashboard -------------------
  document.getElementById("history").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");

  const dashboardSection = document.getElementById("dashboard");
  const dashboard = document.getElementById("dashboardContent");
  dashboard.innerHTML = "";

  // ------------------- Remove Previous Week Banner -------------------
  const existingBanner = dashboardSection.querySelector(".chore__week-banner");
  if (existingBanner) {
    existingBanner.remove();
  }

  // ------------------- Week Date Setup -------------------
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const biweeklyStart = new Date(startOfWeek);
  biweeklyStart.setDate(startOfWeek.getDate() - 7);

  const biweeklyEnd = new Date(endOfWeek);

  const formatDate = (date) =>
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // ------------------- Build and Insert Week Banner -------------------
  const weekBanner = document.createElement("div");
  weekBanner.className = "chore__week-banner";
  weekBanner.innerHTML = `
    <div class="week-banner__row">
      <div class="week-banner__column left">Day</div>
      <div class="week-banner__column center">Week</div>
      <div class="week-banner__column right">Biweekly</div>
    </div>
    <div class="week-banner__row">
      <div class="week-banner__column left">${formatDate(today)}</div>
      <div class="week-banner__column center">${formatDate(startOfWeek)} – ${formatDate(endOfWeek)}</div>
      <div class="week-banner__column right">${formatDate(biweeklyStart)} – ${formatDate(biweeklyEnd)}</div>
    </div>
  `;
  dashboardSection.insertBefore(weekBanner, dashboard);

  // ------------------- Render Each Person's Card -------------------
  people.forEach(person => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.borderTop = `4px solid ${person.color}`;
    card.ondragover = onDragOver;
    card.ondrop = (event) => onDrop(event, person.id);

    // ------------------- De-dupe Chores -------------------
    const uniqueChores = [];
    const seen = new Set();

    for (const chore of person.chores) {
      const key = `${chore.name}|${chore.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueChores.push(chore);
      }
    }

    // ------------------- Split by Type -------------------
    const permanentChores = uniqueChores
    .filter(c => c.origin === "permanent")
    .sort((a, b) => a.type.localeCompare(b.type));
  
  const rotatingChores = ["daily", "weekly", "monthly", "biweekly", "quarterly"]
    .flatMap(type => 
      uniqueChores.filter(c => c.origin === "rotating" && c.type === type)
    );
  

    // ------------------- Build Card HTML -------------------
    card.innerHTML = `
      <div class="card__header">
        <h3 class="card__name" style="color: ${person.color};">${person.name}</h3>
        <span class="card__totals">✅ Completed: ${person.completed.length} / ${person.chores.length}</span>
        <span class="card__owed ${person.paid ? 'paid' : ''}">
          ${person.paid ? '$0 Paid' : `$${person.dollarsOwed} owed`}
        </span>
      </div>
      <ul class="card__chores">
        <li class="chore__section-title" style="background-color: ${person.color}">
          <i class="fas fa-thumbtack"></i> Permanent Chores
        </li>
        ${permanentChores.map(renderChore(person)).join("")}
        <li class="chore__section-title" style="background-color: ${person.color}">
          <i class="fas fa-sync-alt"></i> Rotating Chores
        </li>
        ${rotatingChores.map(renderChore(person)).join("")}
      </ul>
    `;

    // ------------------- Paid Button Setup -------------------
    const paidBtn = document.createElement("button");
    paidBtn.className = person.paid ? "chore-btn chore-btn--paid" : "chore-btn chore-btn--unpaid";
    paidBtn.textContent = person.paid ? "✔️ Paid" : "Mark Paid";
    paidBtn.onclick = () => openPaidModal(person.name);
    paidBtn.style.marginTop = "2rem";

    // ------------------- Wrap Card Content -------------------
    const contentWrapper = document.createElement("div");
    contentWrapper.style.display = "flex";
    contentWrapper.style.flexDirection = "column";
    contentWrapper.style.flexGrow = "1";
    contentWrapper.innerHTML = card.innerHTML;

    card.innerHTML = "";
    card.appendChild(contentWrapper);
    card.appendChild(paidBtn);

    // ------------------- Add Card to Dashboard -------------------
    dashboard.appendChild(card);
  });
};


// ------------------- Function: renderChore -------------------
// Returns HTML for a single chore item
const renderChore = (person) => (choreObj) => {
  const rawName = choreObj.name || choreObj.task || "Unnamed";
  const { type, locked } = choreObj;
  const isDone = Array.isArray(person.completed) && person.completed.includes(rawName);
  const isDraggable = !isDone && !locked;
  const originalOwner = choreObj.originalOwner || null;
  const displayName = originalOwner ? `${rawName} (${originalOwner})` : rawName;

  return `
    <li 
      class="card__chore ${isDone ? 'chore-done' : ''}" 
      draggable="${isDraggable}"
      ondragstart="${isDraggable ? `onDragStart(event, '${person.id}', '${rawName}')` : 'event.preventDefault()'}"
      ${!isDraggable ? 'title="This chore is locked or already completed."' : ''}
    >
      <label class="chore-label">
        <input 
          type="checkbox"
          class="chore-checkbox chore--${person.id}" 
          ${isDone || locked ? 'checked' : ''} 
          ${locked ? 'disabled' : ''}
          onchange="completeChore('${person.name}', '${rawName}')"
        />
        <span>
          <span class="chore-tag chore-tag--${type}">[${type[0]}]</span> 
          ${displayName}
        </span>
      </label>
    </li>
  `;
};

// ------------------- Function: renderHistory -------------------
// Displays the activity log history
const renderHistory = (logs = []) => {
  const container = document.getElementById("historyContent");
  container.innerHTML = "";

  // ------------------- Global Stats Card -------------------
  const totalCompleted = people.reduce((sum, p) => sum + p.completed.length, 0);
  const totalPeople = people.length;
  const paidCount = people.filter(p => p.paid).length;
  const owedCount = totalPeople - paidCount;
  const totalOwed = people.reduce((sum, p) => sum + (p.paid ? 0 : p.dollarsOwed || 0), 0);
  const totalPaid = people.reduce((sum, p) => sum + (p.paid ? p.dollarsOwed || 0 : 0), 0);

  const statsCard = document.createElement("div");
  statsCard.className = "history__card";
  statsCard.innerHTML = `
    <h3 class="history__title">📊 Team Summary</h3>
    <ul class="history__list">
      <li><strong>Total Chores Completed:</strong> ${totalCompleted}</li>
      <li><strong>People Paid:</strong> ${paidCount} / ${totalPeople}</li>
      <li><strong>Unpaid:</strong> ${owedCount} people, $${totalOwed}</li>
      <li><strong>Paid:</strong> $${totalPaid}</li>
    </ul>
  `;
  container.appendChild(statsCard);

  // ------------------- Dynamic Stats -------------------
  const totalChoresAssigned = people.reduce((sum, p) => sum + p.chores.length, 0);

  const mostCompletedPerson = people.reduce((top, p) => 
    p.completed.length > top.count ? { name: p.name, count: p.completed.length } : top, 
    { name: "", count: 0 }
  );

  const mostMissedPerson = people.reduce((worst, p) => {
    const missed = p.chores.length - p.completed.length;
    return missed > worst.missed ? { name: p.name, missed } : worst;
  }, { name: "", missed: 0 });

  const statDetails = document.createElement("div");
  statDetails.className = "history__card";
  statDetails.innerHTML = `
    <h3 class="history__title">📈 Insights</h3>
    <ul class="history__list">
      <li><strong>Completion Rate:</strong> ${Math.round((totalCompleted / totalChoresAssigned) * 100)}%</li>
      <li><strong>Top Helper:</strong> ${mostCompletedPerson.name} (${mostCompletedPerson.count} chores)</li>
      <li><strong>Most Missed:</strong> ${mostMissedPerson.name} (${mostMissedPerson.missed} not done)</li>
    </ul>
  `;
  container.appendChild(statDetails);

  // ------------------- Activity Log (Changelog) -------------------
  const logCard = document.createElement("div");
  logCard.className = "history__card";
  logCard.innerHTML = `
    <h3 class="history__title">📜 Activity Log</h3>
    <ul class="history__list">
      ${logs.length === 0
        ? "<li>No activity logged.</li>"
        : logs.slice(0, 10).map(log => {
          let date = "Unknown Date";
          try {
            const parsed = new Date(log.time ?? log.date ?? null);
            if (!isNaN(parsed.getTime())) {
              date = parsed.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              });
            } else {
              console.warn("⚠️ Invalid timestamp:", log.time, log);
            }
          } catch (e) {
            console.warn("⚠️ Could not parse date for log entry", log, e);
          }
          
          
          switch (log.type) {
            case "completed":
              return `<li>✅ <strong>${log.person}</strong> completed "<em>${log.task}</em>" — <span class="log-date">${date}</span></li>`;
            case "reassigned":
              return `<li>🔄 Rotating chores were reassigned by admin — <span class="log-date">${date}</span></li>`;
            case "transferred":
              return `<li>🤝 <strong>${log.to}</strong> helped <strong>${log.from}</strong> with "<em>${log.task}</em>" — <span class="log-date">${date}</span></li>`;
            case "skipped":
              return `<li>😴 <strong>${log.person}</strong>'s chores skipped for the ${log.duration} <em>(${log.reason})</em> — <span class="log-date">${date}</span></li>`;
            case "manualReset":
              return `<li>🧹 Manual chore reset triggered — <span class="log-date">${date}</span></li>`;
            case "missedChores":
              return `<li>📛 <strong>${log.person}</strong> missed <strong>${log.amount}</strong> chore(s) — <span class="log-date">${date}</span></li>`;
            case "togglePaid":
              const icon = log.status === "paid" ? "💵" : "🚫";
              return `<li>${icon} <strong>${log.person}</strong> marked as ${log.status} — <span class="log-date">${date}</span></li>`;
            case "sandbox":
              return `<li>${log.status === "enabled" ? "📴" : "🟢"} Sandbox Mode ${log.status === "enabled" ? "Enabled" : "Disabled"} — <span class="log-date">${date}</span></li>`;
              case "weeklySnapshot":
                const summary = log.snapshot.map(p => {
                  const assigned = p.chores?.length || 0;
                  const completed = p.completed?.length || 0;
                  return `- ${p.name}: ${assigned} assigned, ${completed} completed`;
                }).join("<br>");
                
                return `<li>📦 Weekly Snapshot — <span class="log-date">${date}</span><br>${summary}</li>`;
              
              default:
              return `<li>📦 ${log.type} — ${JSON.stringify(log)} — <span class="log-date">${date}</span></li>`;
          }
        }).join("")}
    </ul>
  `;
  container.appendChild(logCard);

  // ------------------- Per-Person Chore Logs -------------------
  const peopleWrapper = document.createElement("div");
  peopleWrapper.className = "history__container";

  people.forEach(person => {
    const wrapper = document.createElement("div");
    wrapper.className = "history__card";

    const title = document.createElement("h3");
    title.textContent = person.name;
    title.style.color = person.color;
    title.className = "history__title";

    const ul = document.createElement("ul");
    ul.className = "history__list";

    if (person.completed.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No chores completed this week.";
      ul.appendChild(li);
    } else {
      person.completed.forEach(task => {
        const li = document.createElement("li");
        li.textContent = task;
        ul.appendChild(li);
      });
    }

    wrapper.appendChild(title);
    wrapper.appendChild(ul);
    peopleWrapper.appendChild(wrapper);
  });

  container.appendChild(peopleWrapper);
};


// ============================================================================
// ------------------- Chore Completion & Toggling -------------------
// Completion toggles, paid toggles
// ============================================================================

// ------------------- Function: completeChore -------------------
// Marks a chore complete or uncomplete
const completeChore = (name, choreName) => {
  const person = people.find(p => p.name.toLowerCase() === name.toLowerCase());

  if (!person) {
    console.warn(`[app.js]: ⚠️ Could not find person '${name}'`);
    return;
  }

  if (!Array.isArray(person.completed)) {
    person.completed = [];
  }

  const index = person.completed.indexOf(choreName);

  if (index !== -1) {
    person.completed.splice(index, 1);
    console.log(`[app.js]: ❌ Marked '${choreName}' as incomplete for ${person.name}`);
  } else {
    person.completed.push(choreName);
    console.log(`[app.js]: ✅ Marked '${choreName}' as completed for ${person.name}`);

    logActivity({
      type: "completed",
      person: person.name,
      task: choreName
    });
  }

  // ------------------- Firebase Save & UI Update -------------------
  const updateUI = () => {
    if (location.hash === "#admin") {
      showSection("admin");
    } else {
      renderDashboard();
    }
  };

  if (typeof window.saveChoreData === "function") {
    window.saveChoreData("myHouseholdId", { people })
      .then(() => {
        updateUI();
        showCustomAlert(`✅ ${choreName} marked as completed for ${person.name}.`);
      })
      .catch(err => {
        console.error("[completeChore]: ❌ Firebase sync failed", err);
        updateUI();
        showCustomAlert("⚠️ Chore marked as complete locally only.");
      });
  }
};

// ------------------- Function: togglePaid -------------------
// Toggles paid status and updates owed state
const togglePaid = (name) => {
  const person = people.find(p => p.name === name);
  if (!person) return;

  person.paid = !person.paid;

  logActivity({
    type: "togglePaid",
    person: person.name,
    status: person.paid ? "paid" : "unpaid",
    time: new Date().toISOString()
  });
  

  if (typeof window.saveChoreData === "function") {
    window.saveChoreData("myHouseholdId", { people }).then(() => {
      renderDashboard();
      showCustomAlert(`💵 ${name} marked as ${person.paid ? "Paid" : "Unpaid"}`);
    }).catch(err => {
      console.error("[togglePaid]: ❌ Firebase sync failed", err);
      renderDashboard();
      showCustomAlert("⚠️ Paid status saved locally only");
    });
  } else {
    console.warn("[togglePaid]: ⚠️ Firebase save function not found.");
    renderDashboard();
  }
};

// ============================================================================
// ------------------- Sidebar & Modal Controls -------------------
// All UI buttons and modal visibility control
// ============================================================================

// ------------------- Function: populateAdminDropdowns -------------------
// Populates person selectors in admin modals
function populateAdminDropdowns() {
  const personOptions = people.map(p => `<option value="${p.name}">${p.name}</option>`).join("");

  const dollarSelect = document.getElementById("adminDollarSelect");
  const skipPersonSelect = document.getElementById("skipPersonSelect");
  const smsSelect = document.getElementById("smsPersonSelect");
  const reminderSelect = document.getElementById("reminderPersonSelect");

  if (dollarSelect) dollarSelect.innerHTML = personOptions;
  if (skipPersonSelect) skipPersonSelect.innerHTML = personOptions;

  if (smsSelect) smsSelect.innerHTML = personOptions;
  if (reminderSelect) reminderSelect.innerHTML = personOptions;
}

// ------------------- Function: toggleSidebar -------------------
// Toggles sidebar visibility
const toggleSidebar = () => {
  document.getElementById("sidebar").classList.toggle("open");
};

// ------------------- Function: closeModal -------------------
// Closes all open modals
const closeModal = () => {
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("show"));
};

// ------------------- Function: showSection -------------------
// Shows one section and hides others (dashboard, history, admin)
const showSection = async (idToShow) => {
  const sections = ["dashboard", "history", "admin"];
  
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.toggle("hidden", id !== idToShow);
    } else {
      console.warn(`⚠️ Element with id '${id}' not found in DOM`);
    }

    if (id === "dashboard" && idToShow !== "dashboard") {
      document.getElementById("dashboardContent").innerHTML = "";
    }

    if (id === "history" && idToShow !== "history") {
      document.getElementById("historyContent").innerHTML = "";
    }
  });

  const banner = document.querySelector(".chore__week-banner");
  if (banner && idToShow !== "dashboard") {
    banner.remove();
  }

  if (idToShow === "dashboard") {
    renderDashboard();
  } else if (idToShow === "history") {
    if (!Array.isArray(window._localLogs) || window._localLogs.length === 0) {
      window._localLogs = await fetchActivityLogsFromFirestore("myHouseholdId");
    }
    renderHistory(window._localLogs);
       
  } else if (idToShow === "admin") {
    populateAdminDropdowns();
  }

  document.getElementById("sidebar")?.classList.remove("open");
  document.querySelectorAll(".modal.show").forEach(modal => modal.classList.remove("show"));
};

// ------------------- Function: viewHistory -------------------
// Shows the history panel and closes sidebar
const viewHistory = () => {
  showSection("history");
  toggleSidebar();
};


// ------------------- Function: openReassignModal -------------------
// Opens the reassignment confirmation dialog
const openReassignModal = () => {
  toggleSidebar();
  document.getElementById("reassignModal").classList.add("show");
};

// ------------------- Function: openManualResetModal -------------------
// Opens modal to confirm manual reset
const openManualResetModal = () => {
  document.getElementById("manualResetModal").classList.add("show");
};

// ------------------- Function: confirmManualReset -------------------
// Executes manual reset and closes modal
const confirmManualReset = () => {
  manualResetChores();
  closeModal();
};

// ------------------- Function: openSkipChoreModal -------------------
// Opens the chore skip modal
const openSkipChoreModal = () => {
  document.getElementById("skipChoreModal").classList.add("show");
};

// ------------------- Function: openWeeklySummaryModal -------------------
// Displays chore stats for the current week
const openWeeklySummaryModal = async () => {
  const logs = await fetchActivityLogsFromFirestore("myHouseholdId");
  const start = new Date(getStartOfWeek());

  const thisWeekLogs = logs.filter(log => new Date(log.time) >= start);

  const completedMap = {};
  const skippedMap = {};

  thisWeekLogs.forEach(log => {
    if (log.type === "completed") {
      completedMap[log.person] = (completedMap[log.person] || 0) + 1;
    }
    if (log.type === "skipped") {
      skippedMap[log.person] = (skippedMap[log.person] || 0) + 1;
    }
  });

  const topHelpers = Object.entries(completedMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `<li><strong>${name}</strong>: ✅ ${count} completed</li>`);

  const mostSkipped = Object.entries(skippedMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([name, count]) => `<li><strong>${name}</strong>: 💤 ${count} skips</li>`);

  const totalDone = Object.values(completedMap).reduce((sum, n) => sum + n, 0);

  document.getElementById("weeklySummaryContent").innerHTML = `
    <p><strong>Total Completed:</strong> ${totalDone}</p>
    <p><strong>Top Helpers:</strong></p>
    <ul>${topHelpers.join("") || "<li>None</li>"}</ul>
    <p><strong>Most Skipped:</strong></p>
    <ul>${mostSkipped.join("") || "<li>None</li>"}</ul>
  `;

  document.getElementById("weeklySummaryModal").classList.add("show");
};

// ------------------- Function: toggleSandboxMode -------------------
// Toggles mock data mode for safe testing
const toggleSandboxMode = async () => {
  const isEnabled = document.getElementById("sandboxToggle").checked;
  await saveSettings({ sandboxMode: isEnabled });

  logActivity({
    type: "sandbox",
    status: isEnabled ? "enabled" : "disabled"
  });

  showCustomAlert(`Sandbox Mode ${isEnabled ? "Enabled" : "Disabled"}`);
};

// ------------------- Function: openResetAllModal -------------------
// Opens modal to confirm full reset
const openResetAllModal = () => {
  document.getElementById("resetModal").classList.add("show");
};

// ------------------- Function: confirmSkipChore -------------------
// Applies chore skip with selected period
const confirmSkipChore = () => {
  applySkipChore();
  closeModal();
};

// ------------------- Function: openDollarAdjustModal -------------------
// Opens the owed amount adjustment modal
const openDollarAdjustModal = () => {
  document.getElementById("dollarAdjustModal").classList.add("show");
};

// ------------------- Function: confirmDollarAdjustment -------------------
// Applies new dollar amount to selected user
const confirmDollarAdjustment = () => {
  applyDollarAdjustment();
  closeModal();
};

// ------------------- Function: openPreviewResetModal -------------------
// Displays preview of weekly reset effect
const openPreviewResetModal = async () => { // ✅ add async
  const skippedNames = await getSkippedPeopleThisWeek(); // ✅ add await
  const preview = people.map(p => {
    const isSkipped = skippedNames.includes(p.name.toLowerCase());
    return `<li><strong>${p.name}</strong>: ${isSkipped ? "⏸ Skipped (no reset)" : "✅ Will reset chores"}</li>`;
  });

  document.getElementById("previewResetContent").innerHTML = `<ul>${preview.join("")}</ul>`;
  document.getElementById("previewResetModal").classList.add("show");
};

// ------------------- Function: getSkippedPeopleThisWeek -------------------
// Returns array of people who opted out of this week
const getSkippedPeopleThisWeek = async () => {
  const logs = await fetchActivityLogsFromFirestore("myHouseholdId");

  return logs
    .filter(log =>
      log.type === "skipped" &&
      ["day", "week"].includes(log.duration) &&
      new Date(log.time) >= new Date(getStartOfWeek())
    )
    .map(log => log.person.toLowerCase());
};

// ------------------- Function: confirmReassign -------------------
// Confirms and runs chore reassignment
const confirmReassign = () => {
  logActivity({ type: "reassigned", triggeredBy: "admin" });
  closeModal();
  showCustomAlert("Rotating chores cleared. Reload manually if needed.");
};

// ------------------- Function: setupSwipeSidebar -------------------
// Enables swipe gesture sidebar on mobile
const setupSwipeSidebar = () => {
  let startX = 0;

  document.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });

  document.addEventListener("touchend", (e) => {
    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startX;

    // Swipe left to close
    if (deltaX < -50 && document.getElementById("sidebar").classList.contains("open")) {
      toggleSidebar();
    }
  });
};

setupSwipeSidebar();

// ------------------- Function: openPaidModal -------------------
// Opens the paid confirmation modal
let pendingPaidName = null;

const openPaidModal = (name) => {
  pendingPaidName = name;

  requestAnimationFrame(() => {
    const modal = document.getElementById("paidModal");
    if (!modal) {
      console.error("❌ paidModal not found in DOM.");
      return;
    }
    modal.classList.add("show");
  });
};

// ------------------- Function: confirmMarkPaid -------------------
// Marks person as paid
const confirmMarkPaid = () => {
  if (pendingPaidName) {
    togglePaid(pendingPaidName);
    pendingPaidName = null;
  }
  closeModal();
};

// ------------------- Function: showCustomAlert -------------------
// Displays a toast alert with a message
function showCustomAlert(message, duration = 4500) {
  const alertBox = document.getElementById("customAlert");
  const alertText = document.getElementById("customAlertText");

  if (!alertBox || !alertText) return;

  alertText.textContent = message;
  alertBox.classList.remove("hidden");
  alertBox.classList.add("show");

  setTimeout(() => {
    alertBox.classList.remove("show");
    setTimeout(() => {
      alertBox.classList.add("hidden");
    }, 300); // matches transition duration
  }, duration);
}

// ============================================================================
// ------------------- UI Event Listeners -------------------
// Handles interactions like closing sidebar when clicking outside
// ============================================================================

// ------------------- Function: Close Sidebar on Outside Click -------------------
// Auto-closes sidebar if user clicks outside of it and the toggle button
document.addEventListener("click", (e) => {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.querySelector(".header__menu");

  const sidebarIsOpen = sidebar?.classList.contains("open");
  const clickedInsideSidebar = sidebar?.contains(e.target);
  const clickedToggleButton = toggleBtn?.contains(e.target);

  if (sidebarIsOpen && !clickedInsideSidebar && !clickedToggleButton) {
    sidebar.classList.remove("open");
  }
});

// ============================================================================
// ------------------- Drag-and-Drop Logic -------------------
// Allows drag-to-move chore reassignment
// ============================================================================
let draggedChoreInfo = null;

// ------------------- Function: onDragStart -------------------
// Begins drag of a chore
const onDragStart = (event, fromId, taskName) => {
  draggedChoreInfo = { fromId, taskName };
  event.dataTransfer.setData("text/plain", taskName);
};

// ------------------- Function: onDragOver -------------------
// Enables drop-over behavior
const onDragOver = (event) => {
  event.preventDefault();
};

// ------------------- Function: onDrop -------------------
// Applies chore move between people
// ------------------- Function: onDrop -------------------
// Handles drag-and-drop transfer of a chore from one person to another
const onDrop = (event, toId) => {
  event.preventDefault();

  if (!draggedChoreInfo) {
    draggedChoreInfo = null; // ensure clean state
    return;
  }

  const { fromId, taskName } = draggedChoreInfo;

  // ------------------- Ignore Same Source/Target -------------------
  if (fromId === toId) {
    console.log("[app.js]: 🟡 Drag ignored — source and target are the same.");
    return;
  }

  // ------------------- Validate Helper Target -------------------
  const helper = people.find(p => p.id === toId);
  if (!helper) {
    console.error(`[app.js]: ❌ Helper person not found: ${toId}`);
    return;
  }

  // ------------------- Skip if Already Completed -------------------
  if (helper.completed.includes(taskName)) {
    return;
  }

  helper.completed.push(taskName);

  // ------------------- Locate Original Owner & Chore -------------------
  const originalOwner = people.find(p => p.id === fromId);
  if (!originalOwner) return;

  const originalChore = originalOwner.chores.find(c => c.name === taskName);
  if (!originalChore) return;

  // ------------------- Inject into Helper (if not already injected) -------------------
  const alreadyInjected = helper.chores.some(
    c => c.name === taskName && c.helper
  );

  if (!alreadyInjected) {
    helper.chores.push({
      ...originalChore,
      helper: true,
      originalOwner: originalOwner.name,
      locked: true
    });

    // Remove from original owner
    originalOwner.chores = originalOwner.chores.filter(c => c.name !== taskName);

    // Log the transfer
    logActivity({
      type: "transferred",
      from: originalOwner.name,
      to: helper.name,
      task: taskName
    });
  }

  // ------------------- Dollar Update, Save, and UI Refresh -------------------
  helper.dollarsOwed = Math.max((helper.dollarsOwed || 0) - 1, 0);

  savePeople();
  debouncedFirebaseSave();

  renderDashboard();
  draggedChoreInfo = null;
};

// ============================================================================
// ------------------- Init & Data Loading -------------------
// Loads people and chore data from Firebase and data.json, processes full state
// ============================================================================

// ------------------- Init Vars -------------------
let people = [];
let savedPeople = [];
let choreData = {};

// ------------------- Sandbox Mode -------------------
let isSandboxMode = false;

// ------------------- Function: handleError -------------------
const handleError = (error, context, showAlert = true) => {
  console.error(`❌ Error in ${context}:`, error);
  if (showAlert) {
    showCustomAlert(`❌ Error: ${error.message || 'Something went wrong'}`);
  }
};

// ------------------- Function: initializeApp -------------------
async function initializeApp() {
  try {
    const settings = await getSettings();
    isSandboxMode = settings.sandboxMode || false;
    
    const banner = document.getElementById("sandboxBanner");
    const checkbox = document.getElementById("sandboxToggle");
    const autoResetToggle = document.getElementById("disableAutoResetToggle");
    
    // Update sandbox mode UI
    if (settings.sandboxMode && banner) {
      banner.classList.remove("hidden");
    }
    if (checkbox) {
      checkbox.checked = settings.sandboxMode || false;
    }

    // Update auto reset toggle
    if (autoResetToggle) {
      autoResetToggle.checked = settings.autoResetDisabled || false;
    }

    populateAdminDropdowns();
    updateLastUpdatedText();
    await initializeResetTimestamps();
    await autoResetIfNeeded();
  } catch (error) {
    handleError(error, "Initializing app");
  }
}

// ------------------- DOM Ready Bootstrapping -------------------
document.addEventListener("DOMContentLoaded", initializeApp);


// ------------------- Function: Init Async Loader -------------------
// Loads cloud data, merges with static data, processes startup logic
(async () => {
  try {
    // Load people data from Firebase
    const cloudData = await window.loadChoreData("myHouseholdId");
    savedPeople = (cloudData && cloudData.people) || [];
  } catch (err) {
    console.error("[app.js]: ❌ Failed to load from Firebase. Cannot continue.", err);
    showCustomAlert("❌ Could not load chore data from cloud.");
    return;
  }

  try {
    const res = await fetch("data.json");
    if (!res.ok) throw new Error("Invalid response from data.json");

    const data = await res.json();

    const cloudData = await window.loadChoreData("myHouseholdId");
    if (!cloudData || !Array.isArray(cloudData.people)) {
      throw new Error("❌ Firebase returned no people data.");
    }

    const staticPeople = data.people || [];
    const cloudPeople = cloudData.people || [];

    // Merge people from static (phone/carrier) with cloud (progress/state)
    people = staticPeople.map(staticPerson => {
      const cloudMatch = cloudPeople.find(p => p.id === staticPerson.id);
      return {
        ...staticPerson,
        ...cloudMatch
      };
    });

    choreData = data.chores;
    renderDashboard();

  } catch (err) {
    console.error("[app.js]: ❌ Failed to load chore data", err);
    showCustomAlert("❌ Failed to load chores or people from cloud. Please try again.");
  }
})();


// ============================================================================
// ------------------- Schedule -------------------
// Determines if a chore should be reset
// ============================================================================

// ------------------- Function: shouldReset -------------------
// Checks if a given chore type needs resetting
function shouldReset(frequency, lastResetDate = null) {
  const today = new Date();
  const now = today.toDateString();

  switch (frequency) {
    case "daily":
      return !lastResetDate || new Date(lastResetDate).toDateString() !== now;

    case "weekly":
      return today.getDay() === 0 && (!lastResetDate || new Date(lastResetDate).toDateString() !== now);

    case "biweekly":
      const weekNumber = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(today.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000)) + 1;
      return today.getDay() === 0 && weekNumber % 2 === 0 &&
        (!lastResetDate || new Date(lastResetDate).toDateString() !== now);

    case "monthly":
      return today.getDate() === 1 && (!lastResetDate || new Date(lastResetDate).toDateString() !== now);

    case "quarterly":
      return today.getDate() === 1 &&
        [0, 3, 6, 9].includes(today.getMonth()) &&
        (!lastResetDate || new Date(lastResetDate).toDateString() !== now);

    default:
      return false;
  }
}

// ------------------- Function: fetchActivityLogsFromFirestore -------------------
async function fetchActivityLogsFromFirestore(householdId = "default") {
  try {
    const logsCollectionRef = window.collection(window.db, "households", householdId, "logs");
    const snapshot = await window.getDocs(logsCollectionRef);
    const logs = snapshot.docs.map(doc => doc.data());

    return logs.sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date));
  } catch (err) {
    console.error("❌ Failed to fetch activity logs:", err);
    return [];
  }
}


// 🔁 Make available globally
window.fetchActivityLogsFromFirestore = fetchActivityLogsFromFirestore;


// ------------------- Auto Weekly + Daily Reset (Firebase Synced) -------------------
async function autoResetIfNeeded(data) {
  if (!data) {
    // If no data provided, try to load it
    try {
      // Wait for Firebase to be ready
      if (!isFirebaseReady()) {
        console.log("⏳ Waiting for Firebase to initialize...");
        await new Promise(resolve => {
          const checkInterval = setInterval(() => {
            if (isFirebaseReady()) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        });
      }

      const householdRef = window.db.collection('households').doc('myHouseholdId');
      const doc = await householdRef.get();
      if (!doc.exists) {
        console.error("❌ Household not found");
        return;
      }
      data = doc.data();
    } catch (err) {
      console.error("❌ Error loading household data:", err);
      return;
    }
  }

  try {
    const metaRef = window.db.collection('meta').doc('lastReset');
    const metaDoc = await metaRef.get();
    const existing = metaDoc.exists ? metaDoc.data() : {};
    const now = new Date();
    const nowISO = now.toISOString();
    const updates = {};

    // Track which frequencies need reset
    const frequencies = ["daily", "weekly", "biweekly", "monthly", "quarterly"];
    const needsResetMap = {};
    frequencies.forEach(freq => {
      needsResetMap[freq] = shouldReset(freq, existing[freq]);
    });

    // If nothing needs reset, return early
    if (!Object.values(needsResetMap).some(Boolean)) {
      console.log("✅ No resets needed");
      return;
    }

    // Process each person's chores
    const people = data.people || [];
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
          await logActivity('myHouseholdId', {
            type: "missedChores",
            person: person.name,
            amount: missedChores.length,
            chores: missedChores.map(c => c.name)
          });
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
      const updatedPeople = await reassignRotatingChores(people, choreData.rotating || []);
      data.people = updatedPeople;
    }

    // Update timestamps
    frequencies.forEach(freq => {
      if (needsResetMap[freq]) {
        updates[freq] = nowISO;
      }
    });

    // Save all changes
    const batch = window.writeBatch(window.db);
    
    // Update household data
    batch.update(window.doc(window.db, "households", "myHouseholdId"), { people: data.people });
    
    // Update reset timestamps
    batch.set(window.doc(window.db, "meta", "lastReset"), { ...existing, ...updates }, { merge: true });
    
    try {
      await batch.commit();
      console.log("✅ Reset completed successfully");
      
      // Reload data after successful reset
      await loadHouseholdData();
    } catch (err) {
      console.error("❌ Failed to save changes:", err);
      throw err;
    }

  } catch (error) {
    console.error("❌ Error during reset:", error);
    throw error;
  }
}

// Add auto-reset check to page load
document.addEventListener("DOMContentLoaded", async () => {
  // ... existing code ...

  // 🔁 Auto-reset logic (Firebase-based)
  await initializeResetTimestamps();        // ✅ Ensure meta.lastReset structure exists
  await autoResetIfNeeded();                // ✅ Check and perform resets if needed
});

// Add auto-reset check to page visibility change
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    await autoResetIfNeeded();
  }
});


// ============================================================================
// ------------------- Master Chore Logic -------------------
// Consolidated chore reset/assignment logic
// ============================================================================

// ------------------- Function: assignAllChores -------------------
// Handles all chore assignment & rotation
function assignAllChores() {
  const permanentList = Object.entries(choreData.permanent || {}).flatMap(([personId, chores]) =>
    chores.map(c => ({
      task: c.task,
      name: c.task,
      type: c.type,
      people: [personId]
    }))
  );

  const rotatingList = Array.isArray(choreData.rotating) ? choreData.rotating : [];

  people.forEach(person => {
    const id = person.id;

    const permanent = permanentList.filter(c =>
      Array.isArray(c.people) && c.people.includes(id)
    );

    const rotating = rotatingList.filter(c =>
      Array.isArray(c.people) && c.people.includes(id)
    );

    const allChores = [
      ...permanent.map(c => ({
        task: c.task,
        name: c.task,
        type: c.type,
        origin: "permanent"
      })),
      ...rotating.map(c => ({
        task: c.task,
        name: c.task,
        type: c.type,
        origin: "rotating"
      }))
    ];

    person.chores = allChores;
  });

  savePeople();
  debouncedFirebaseSave();
  updateLastUpdatedText(); // ✅ ADD HERE
}

// ------------------- Function: manualResetChores -------------------
// Wrapper: Resets with missed chore tracking and adds missed chore penalty
function manualResetChores() {
  const snapshot = people.map(p => ({
    id: p.id,
    name: p.name,
    chores: Array.isArray(p.chores) ? p.chores.map(c => c.name) : [],
    completed: [...(p.completed || [])],
    dollarsOwed: p.dollarsOwed || 0
  }));

  const missed = [];

  snapshot.forEach(p => {
    const missedTasks = p.chores.filter(task => !p.completed.includes(task));
    if (missedTasks.length > 0) {
      missed.push({
        id: p.id,
        person: p.name,
        amount: missedTasks.length
      });
    }
  });

  missed.forEach(entry => {
    const person = people.find(p => p.id === entry.id);
    if (!person) return;

    person.dollarsOwed = (person.dollarsOwed || 0) + entry.amount;
    person.paid = false;

    logActivity({
      type: "missedChores",
      person: entry.person,
      amount: entry.amount
    });
  });

  const now = new Date();
  logActivity({
    type: "manualReset",
    time: now.toISOString()
  });

  reassignRotatingChores(); // ✅ CRITICAL: repopulates .people for rotating chores
  assignAllChores();

  people.forEach(p => p.completed = []);

  savePeople();
  debouncedFirebaseSave();
  showSection("admin");
  closeModal();
  updateLastUpdatedText(); // ✅ ADD HERE
  showCustomAlert("🔁 Manual reset complete. Rotating chores reassigned and missed chores tallied.");
}

// ------------------- Function: handleDailyMissedChores -------------------
// Adds $1 per missed daily chore for each user, logs activity
async function handleDailyMissedChores() {
  const snapshot = people.map(p => ({
    id: p.id,
    name: p.name,
    chores: Array.isArray(p.chores) ? p.chores.filter(c => c.type === 'daily').map(c => c.name) : [],
    completed: [...(p.completed || [])],
    dollarsOwed: p.dollarsOwed || 0
  }));

  snapshot.forEach(p => {
    const missed = p.chores.filter(task => !p.completed.includes(task));
    if (missed.length > 0) {
      const person = people.find(x => x.id === p.id);
      person.dollarsOwed = (person.dollarsOwed || 0) + missed.length;
      person.paid = false;

      logActivity({
        type: "missedChores",
        person: p.name,
        amount: missed.length
      });
    }
  });
}

// ------------------- Function: confirmResetAll -------------------
// Wrapper: Wipes all and resets without missed logging
function confirmResetAll() {
  reassignRotatingChores();
  assignAllChores();

  people.forEach(p => {
    p.completed = [];
    p.dollarsOwed = 0;
    p.paid = true;
  });

  savePeople();
  debouncedFirebaseSave();

  clearActivityLogs("myHouseholdId"); // ✅ Wipe Firestore logs too

  showSection("admin");
  closeModal();
  updateLastUpdatedText();
  showCustomAlert("🧹 All chores, payments, completions, and logs reset.");
}
// ------------------- Function: clearActivityLogs -------------------
// Deletes all activity logs for the household in Firestore
async function clearActivityLogs(householdId = "default") {
  try {
    const logsCollectionRef = window.collection(window.db, "households", householdId, "logs");
    const snapshot = await window.getDocs(logsCollectionRef);

    const batch = window.writeBatch(window.db);
    snapshot.forEach(docSnap => {
      const docRef = window.doc(window.db, "households", householdId, "logs", docSnap.id);
      batch.delete(docRef);
    });

    await batch.commit();
    console.log("🧹 Cleared all activity logs from Firestore.");
  } catch (err) {
    console.error("❌ Failed to clear activity logs:", err);
  }
}
// ------------------- Function: reassignRotatingChores -------------------
// Wrapper: Weekly auto reset with snapshot + optional dollar adjustment
function reassignRotatingChores() {
  console.log("🔁 Running reassignRotatingChores...");

  const snapshot = people.map(p => ({
    name: p.name,
    chores: p.chores.map(c => c.name),
    completed: [...(p.completed || [])]
  }));

  console.log("📸 Weekly snapshot:", snapshot);

  const missed = [];

  snapshot.forEach(p => {
    const missedTasks = p.chores.filter(c => !p.completed.includes(c));
    if (missedTasks.length > 0) {
      missed.push({
        person: p.name,
        amount: missedTasks.length
      });
    }
  });

  missed.forEach(entry => {
    console.log(`⚠️ ${entry.person} missed ${entry.amount} chores`);
  });

  const now = new Date();
  logActivity({
    type: "weeklySnapshot",
    time: now.toISOString(),
    snapshot
  });

  // ------------------- Regenerate Rotating Chores -------------------
  if (Array.isArray(choreData.rotating)) {
    const peopleIds = people.map(p => p.id);
    const totalPeople = peopleIds.length;

    const grouped = {
      daily: [],
      weekly: [],
      biweekly: [],
      monthly: [],
      quarterly: [] // Ignored here unless you add support later
    };

    // 🧮 Group chores by type
    for (const chore of choreData.rotating) {
      if (grouped[chore.type]) grouped[chore.type].push(chore);
    }

    // 🔄 Shuffle each group
    for (const type in grouped) {
      grouped[type] = grouped[type].sort(() => Math.random() - 0.5);
    }

    const assigned = Object.fromEntries(peopleIds.map(id => [id, []]));

    // ✅ Track all assigned names to prevent duplicates across everyone
    const alreadyAssignedNames = new Set();

    // ✅ Helper to assign chores
    function assignChores(type, limitPerPerson, required = true) {
      let pool = [...grouped[type]];
      for (const personId of peopleIds) {
        const current = assigned[personId].filter(c => c.type === type).length;
        const needed = required ? limitPerPerson : Math.min(limitPerPerson, pool.length > 0 ? 1 : 0);
        let count = 0;

        while (count < needed && pool.length > 0) {
          const chore = pool.find(c => !alreadyAssignedNames.has(c.task || c.name));
          if (!chore) break;

          pool = pool.filter(c => (c.task || c.name) !== (chore.task || chore.name));
          alreadyAssignedNames.add(chore.task || chore.name);
          assigned[personId].push({ ...chore, people: [personId] });
          count++;
        }
      }
    }

    // ✅ Step 1: 1 Daily each
    assignChores("daily", 1, true);

    // ✅ Step 2: 1 Biweekly each
    assignChores("biweekly", 1, true);

    // ✅ Step 3: 1 Weekly min for each
    assignChores("weekly", 1, true);

    // ✅ Step 4: Try to assign 1 Monthly only if still under 4
    for (const personId of peopleIds) {
      if (assigned[personId].length < 4 && grouped.monthly.length > 0) {
        const chore = grouped.monthly.find(c => !alreadyAssignedNames.has(c.task || c.name));
        if (chore) {
          grouped.monthly = grouped.monthly.filter(c => (c.task || c.name) !== (chore.task || chore.name));
          alreadyAssignedNames.add(chore.task || chore.name);
          assigned[personId].push({ ...chore, people: [personId] });
        }
      }
    }

    // ✅ Step 5: Add 1 extra weekly max if still under 4
    for (const personId of peopleIds) {
      if (assigned[personId].length < 4 && grouped.weekly.length > 0) {
        const chore = grouped.weekly.find(c => !alreadyAssignedNames.has(c.task || c.name));
        if (chore) {
          grouped.weekly = grouped.weekly.filter(c => (c.task || c.name) !== (chore.task || chore.name));
          alreadyAssignedNames.add(chore.task || chore.name);
          assigned[personId].push({ ...chore, people: [personId] });
        }
      }
    }

    // ✅ Final Filler: If still under 4, randomly assign any leftovers (uniquely)
    let fallbackPool = [
      ...grouped.daily,
      ...grouped.weekly,
      ...grouped.biweekly,
      ...grouped.monthly
    ].sort(() => Math.random() - 0.5);

    for (const personId of peopleIds) {
      while (assigned[personId].length < 4 && fallbackPool.length > 0) {
        const chore = fallbackPool.find(c => !alreadyAssignedNames.has(c.task || c.name));
        if (!chore) break;

        fallbackPool = fallbackPool.filter(c => (c.task || c.name) !== (chore.task || chore.name));
        alreadyAssignedNames.add(chore.task || chore.name);
        assigned[personId].push({ ...chore, people: [personId] });
      }
    }

    // ✅ Apply to choreData.rotating
    choreData.rotating = peopleIds.flatMap(id => assigned[id]);

    // 🔍 Confirm everyone has 4
    const counts = Object.fromEntries(peopleIds.map(id => [id, assigned[id].length]));
    console.log("🎯 Final chore counts (should be 4 each):");
    console.table(counts);
  }

  console.log("🎲 Reassigning rotating chores...");
  assignAllChores();
  console.log("✅ assignAllChores() complete");

  people.forEach(p => {
    p.completed = [];
    console.log(`🧹 Cleared completed chores for ${p.name}`);
  });

  savePeople();
  debouncedFirebaseSave();
  renderDashboard();
  updateLastUpdatedText();
  showCustomAlert("🔁 Rotating chores reassigned. Missed chore data recorded.");
}


// ------------------- Function: assignRotatingChores -------------------
// Deprecated wrapper for compatibility
function assignRotatingChores() {
  assignAllChores();
}

// ------------------- Function: toggleAutoReset -------------------
// Toggles localStorage flag to disable auto reset logic
const toggleAutoReset = async () => {
  const isDisabled = document.getElementById("disableAutoResetToggle").checked;
  await saveSettings({ autoResetDisabled: isDisabled });
};

// ============================================================================
// ------------------- Window Bindings -------------------
// Expose selected functions to global scope for inline HTML access
// ============================================================================

window.applyDollarAdjustment     = applyDollarAdjustment;
window.applySkipChore            = applySkipChore;
window.closeModal                = closeModal;
window.completeChore             = completeChore;
window.confirmDollarAdjustment   = confirmDollarAdjustment;
window.confirmManualReset        = confirmManualReset;
window.confirmMarkPaid           = confirmMarkPaid;
window.confirmReassign           = confirmReassign;
window.confirmResetAll           = confirmResetAll;
window.confirmSkipChore          = confirmSkipChore;
window.forceReassignChores       = reassignRotatingChores; // alias
window.logActivity               = logActivity;
window.onDragOver                = onDragOver;
window.onDragStart               = onDragStart;
window.onDrop                    = onDrop;
window.openDollarAdjustModal     = openDollarAdjustModal;
window.openManualResetModal      = openManualResetModal;
window.openPreviewResetModal     = openPreviewResetModal;
window.openReassignModal         = openReassignModal;
window.openResetAllModal         = openResetAllModal;
window.openSkipChoreModal        = openSkipChoreModal;
window.openWeeklySummaryModal    = openWeeklySummaryModal;
window.previewReset              = openPreviewResetModal; // alias
window.reassignRotatingChores    = reassignRotatingChores;
window.sendChoreEmail            = sendChoreEmail;
window.showSection               = showSection;
window.toggleAutoReset           = toggleAutoReset;
window.togglePaid                = togglePaid;
window.toggleSandboxMode         = toggleSandboxMode;
window.toggleSidebar             = toggleSidebar;
window.viewHistory               = viewHistory;
window.autoResetIfNeeded         = autoResetIfNeeded;

// ------------------- Function: refreshChorePage -------------------
window.refreshChorePage = function () {
  const icon = document.querySelector('.refresh-icon');
  if (icon) {
    icon.classList.add('spin');
    setTimeout(() => icon.classList.remove('spin'), 600);
  }

  renderDashboard();
  updateLastUpdatedText();
  showCustomAlert("🔄 Page refreshed.");
};

function updateLastUpdatedText() {
  const el = document.getElementById("lastUpdatedText");
  if (!el) return;

  const now = new Date();
  const formatted = now.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  el.textContent = `Last updated: ${formatted}`;
}

// Add loading state management
let isLoading = false;
let lastLoadTime = 0;
const LOAD_COOLDOWN = 2000; // 2 seconds cooldown between loads

// Helper to check if we should load data
const shouldLoadData = () => {
  const now = Date.now();
  if (isLoading || (now - lastLoadTime) < LOAD_COOLDOWN) {
    return false;
  }
  isLoading = true;
  lastLoadTime = now;
  return true;
};

// Helper to finish loading
const finishLoading = () => {
  isLoading = false;
};

// Add a function to check if Firebase is ready
function isFirebaseReady() {
  return window.db && typeof window.db.collection === 'function';
}

// Add Firebase initialization helper
const initializeFirebase = async () => {
  try {
    if (!isFirebaseReady()) {
      console.log("⏳ Waiting for Firebase to initialize...");
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (isFirebaseReady()) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }
    return true;
  } catch (error) {
    console.error("❌ Firebase initialization failed:", error);
    showCustomAlert("❌ Failed to initialize Firebase. Please refresh the page.");
    return false;
  }
};

// Add retry mechanism for Firebase operations
const withRetry = async (operation, maxRetries = 3) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }
  throw lastError;
};

// Update loadHouseholdData to use new helpers
async function loadHouseholdData() {
  if (!shouldLoadData()) {
    console.log("⏳ Skipping load - too soon or already loading");
    return;
  }

  try {
    if (!await initializeFirebase()) {
      return;
    }

    const data = await withRetry(async () => {
      const householdRef = window.db.collection('households').doc('myHouseholdId');
      const doc = await householdRef.get();
      
      if (!doc.exists) {
        throw new Error("Household not found");
      }

      const data = doc.data();
      if (!data) {
        throw new Error("No data in household document");
      }

      return data;
    });

    // Update UI with new data
    try {
      updateUI(data);
    } catch (err) {
      handleError(err, "UI update", false);
    }

    // Check for resets
    try {
      await autoResetIfNeeded(data);
    } catch (err) {
      handleError(err, "Auto reset", false);
    }

  } catch (error) {
    handleError(error, "Loading household data");
  } finally {
    finishLoading();
  }
}

// Update savePeople to use new helpers
async function savePeople() {
  if (isSandboxMode) {
    console.warn("[Sandbox Mode]: Prevented savePeople");
    return;
  }

  try {
    if (!await initializeFirebase()) {
      return;
    }

    await withRetry(async () => {
      if (typeof window.saveChoreData === "function") {
        await window.saveChoreData("myHouseholdId", { people });
        console.log("✅ Data saved successfully");
        updateLastUpdatedText();
        showCustomAlert("✅ Changes saved");
      } else {
        throw new Error("Firebase save function not available");
      }
    });
  } catch (error) {
    handleError(error, "Saving data");
  }
}

// Update logActivity to use new helpers
async function logActivity(entry, householdId = "default") {
  if (isSandboxMode) {
    console.warn("[Sandbox Mode]: Prevented logActivity");
    return;
  }

  try {
    if (!await initializeFirebase()) {
      return;
    }

    // Ensure time is present
    if (!entry.time && !entry.date) {
      entry.time = new Date().toISOString();
    }

    await withRetry(async () => {
      const logRef = window.doc(window.db, "households", householdId, "logs", crypto.randomUUID());
      await window.setDoc(logRef, entry);
      console.log("📝 Logged to Firestore:", entry);

      // Update local logs
      if (!Array.isArray(window._localLogs)) {
        window._localLogs = [];
      }
      window._localLogs.unshift(entry);

      // Re-render history if needed
      const historyPanel = document.getElementById("history");
      if (historyPanel && !historyPanel.classList.contains("hidden") && typeof renderHistory === "function") {
        renderHistory(window._localLogs);
      }
    });
  } catch (error) {
    handleError(error, "Logging activity", false);
  }
}

// Add Firebase settings management
const SETTINGS_DOC = 'settings';

// Helper to get settings from Firebase
async function getSettings() {
  try {
    if (!await initializeFirebase()) {
      return {};
    }

    const settingsRef = window.doc(window.db, "meta", SETTINGS_DOC);
    const doc = await settingsRef.get();
    return doc.exists ? doc.data() : {};
  } catch (error) {
    handleError(error, "Loading settings");
    return {};
  }
}

// Helper to save settings to Firebase
async function saveSettings(settings) {
  try {
    if (!await initializeFirebase()) {
      return;
    }

    await withRetry(async () => {
      const settingsRef = window.doc(window.db, "meta", SETTINGS_DOC);
      await window.setDoc(settingsRef, settings, { merge: true });
    });
  } catch (error) {
    handleError(error, "Saving settings");
  }
}