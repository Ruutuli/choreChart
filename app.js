/* ============================================================================
   app.js — Logic for Chore Tracker: Rendering, Points, Admin, Dashboard
============================================================================ */

/* ============================================================================
   00. Data Persistence & Utilities
============================================================================ */
// savePeople
function savePeople() {
  if (isSandboxMode) {
    console.warn("[Sandbox Mode]: Prevented savePeople");
    return;
  }

  if (typeof window.saveChoreData === "function") {
    return window.saveChoreData("myHouseholdId", { people });
  } else {
    console.warn("[savePeople]: ⚠️ Firebase save function not available.");
  }
}


// assignRotatingChores
function assignRotatingChores() {
  console.log("Reassigning rotating chores...");
  // Put your actual chore assignment logic here
}

// logActivity
function logActivity(entry) {
  if (isSandboxMode) {
    console.warn("[Sandbox Mode]: Prevented logActivity");
    return;
  }

  console.log("[Activity Log]:", entry);

  const logs = JSON.parse(localStorage.getItem("activityLog") || "[]");
  logs.unshift(entry);
  localStorage.setItem("activityLog", JSON.stringify(logs));
}

// populateAdminDollarSelect
function populateAdminDollarSelect() {
  const select1 = document.getElementById("adminDollarSelect");
  const select2 = document.getElementById("skipPersonSelect");

  [select1, select2].forEach(select => {
    if (!select) return;
    select.innerHTML = "";
    const logs = JSON.parse(localStorage.getItem("activityLog") || "[]");

    // Get list of people skipped this week
    const skippedPeople = logs
      .filter(log =>
        log.type === "skipped" &&
        ["day", "week"].includes(log.duration) &&
        new Date(log.time) >= new Date(getStartOfWeek())
      )
      .map(log => log.person.toLowerCase());
    
    people.forEach(p => {
      const wasSkipped = skippedPeople.includes(p.name.toLowerCase());
    
      if (wasSkipped) {
        console.log(`[reset]: Skipping chore reset for ${p.name} due to skip log`);
        return;
      }
    
      p.completed = [];
    });
    
  });
}

// ------------------- Debounced Firebase Save -------------------
let saveTimeout = null;
function debouncedFirebaseSave(delay = 1000) {
  clearTimeout(saveTimeout);

  saveTimeout = setTimeout(() => {
    window.saveChoreData("myHouseholdId", { people })
      .then(() => {
        console.log("[Firebase]: ✅ Data synced");
        showCustomAlert("✅ Changes saved");
      })
      .catch(err => {
        console.error("[Firebase]: ❌ Save failed", err);
        showCustomAlert("⚠️ Failed to sync with cloud");
      });
  }, delay);
}
/* ============================================================================
   01. Time & Chore Cycle Logic
============================================================================ */
// getStartOfWeek
// Returns the YYYY-MM-DD string for the most recent Sunday.
const getStartOfWeek = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // Sunday = 0
  const diff = now.getDate() - dayOfWeek;
  const sunday = new Date(now.setDate(diff));
  sunday.setHours(0, 0, 0, 0);
  return sunday.toISOString().split("T")[0];
};

// isBiweeklyWeek
// Determines whether this is a biweekly reset week.
const isBiweeklyWeek = () => {
  const anchorSunday = new Date("2024-01-07T00:00:00"); // first-ever chore week
  const now = new Date();
  const diffWeeks = Math.floor((now - anchorSunday) / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks % 2 === 0;
};

// shouldReassignRotatingChores
// Checks if a new weekly cycle has started since last recorded.
const shouldReassignRotatingChores = () => {
  const currentStart = getStartOfWeek();
  return storedStart !== currentStart;
};

// reassignRotatingChores
// Triggers normal reassignment logic used on Sundays
function reassignRotatingChores() {
  assignRotatingChores(); // use your existing rotation logic
  savePeople();

  const logs = JSON.parse(localStorage.getItem("activityLog") || "[]");
  logs.unshift({
    type: "reassigned",
    time: new Date().toISOString()
  });
  localStorage.setItem("activityLog", JSON.stringify(logs));

  showCustomAlert("✅ Chores reassigned successfully.");
  renderDashboard(); // optional: refresh immediately
}

// updateChoreCycleStartDate
// Sets localStorage to the current week's start date (Sunday).
const updateChoreCycleStartDate = () => {
  const currentStart = getStartOfWeek();
};

// autoResetChoresIfNeeded
// Resets completed chores automatically at Sunday 12:00 AM.
const autoResetChoresIfNeeded = () => {
  const now = new Date();
  const isSundayMidnight =
    now.getDay() === 0 &&
    now.getHours() === 0 &&
    now.getMinutes() === 0;

  const currentStart = getStartOfWeek();

  if (isSundayMidnight && storedStart !== currentStart) {
    console.log("[app.js]: ⏰ Auto-resetting chores at Sunday midnight");
    updateChoreCycleStartDate();

    people.forEach(p => {
      p.completed = [];
    });

    savePeople(); // <-- This is the proper global function used elsewhere
    renderDashboard();    
  }
};

// toggleAutoReset
function toggleAutoReset() {
  const isDisabled = document.getElementById("disableAutoResetToggle").checked;
  localStorage.setItem("autoResetDisabled", isDisabled ? "true" : "false");
}

/* ============================================================================
   02. Admin Tools & Modals
============================================================================ */
// openEditChoresModal
function openEditChoresModal() {
  const select = document.getElementById("editChoresPersonSelect");
  select.innerHTML = "";
  people.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = p.name;
    select.appendChild(opt);
  });

  document.getElementById("editChoresList").value = "";
  document.getElementById("editChoresModal").classList.remove("hidden");
}

// closeEditChoresModal
function closeEditChoresModal() {
  document.getElementById("editChoresModal").classList.add("hidden");
}

// saveEditedChores
function saveEditedChores() {
  const name = document.getElementById("editChoresPersonSelect").value;
  const tasks = document.getElementById("editChoresList").value
    .split("\n")
    .map(t => t.trim())
    .filter(Boolean);

  const person = people.find(p => p.name === name);
  if (person) {
    person.completed = tasks;
    savePeople();

    if (typeof window.saveChoreData === "function") {
      window.saveChoreData("myHouseholdId", { people }).then(() => {
        showCustomAlert("✅ Completed chores updated.");
        closeEditChoresModal();
        renderDashboard();
      }).catch(err => {
        console.error("[saveEditedChores]: ❌ Firebase sync failed", err);
        showCustomAlert("⚠️ Saved locally but not synced.");
        closeEditChoresModal();
        renderDashboard();
      });
    } else {
      showCustomAlert("✅ Completed chores updated.");
      closeEditChoresModal();
      renderDashboard();
    }

  }
}

// previewReset
function previewReset() {
  const preview = people.map(p => {
    return `${p.name}: Would keep ${p.completed.length} tasks, reset owed if unpaid`;
  }).join("\n");

  showCustomAlert("Reset Preview:\n\n" + preview);
}

// ------------------- Reset Everything -------------------
function confirmResetAll() {
  closeModal();

  const rotatingChores = choreData.rotating || [];
  const totalRotating = rotatingChores.length;
  const peopleCount = people.length;

  // Distribute rotating chores in round-robin
  const rotatingAssignments = Array.from({ length: peopleCount }, () => []);
  for (let i = 0; i < totalRotating; i++) {
    const personIndex = i % peopleCount;
    rotatingAssignments[personIndex].push(rotatingChores[i]);
  }

  people.forEach((p, index) => {
    p.dollarsOwed = 0;
    p.paid = false;
    p.completed = [];

    const newChores = [];

    let permanent = [];
    const match = Object.entries(choreData.permanent || {}).find(([key]) =>
      key.toLowerCase() === p.name.toLowerCase()
    );
    if (match) permanent = match[1];
    

    for (const chore of permanent) {
      const taskName = chore.task ?? chore.name ?? "Unnamed Task";
      newChores.push({
        name: taskName,
        task: taskName,
        type: chore.type ?? "unspecified",
        origin: "permanent"
      });
    }

    for (const chore of rotatingAssignments[index]) {
      const taskName = chore.task ?? chore.name ?? "Unnamed Task";
      newChores.push({
        name: taskName,
        task: taskName,
        type: chore.type ?? "unspecified",
        origin: "rotating"
      });
    }

    p.chores = newChores;
  });

  logActivity({ type: "manualReset", time: new Date().toISOString() });

  if (typeof window.saveChoreData === "function") {
    window.saveChoreData("myHouseholdId", { people }).then(() => {
      renderDashboard();
      showCustomAlert("🗑️ All data reset and reassigned.");
    }).catch(err => {
      console.error("[confirmResetAll]: ❌ Firebase sync failed", err);
      renderDashboard();
      showCustomAlert("⚠️ Reset saved locally but not synced.");
    });
  } else {
    renderDashboard();
    showCustomAlert("🗑️ All data reset and reassigned.");
  }
}

// ------------------- Manual Reset Chores -------------------
function manualResetChores() {
  const rotatingChores = choreData.rotating || [];
  const totalRotating = rotatingChores.length;
  const peopleCount = people.length;

  // Distribute rotating chores in round-robin
  const rotatingAssignments = Array.from({ length: peopleCount }, () => []);
  for (let i = 0; i < totalRotating; i++) {
    const personIndex = i % peopleCount;
    rotatingAssignments[personIndex].push(rotatingChores[i]);
  }

  people.forEach((p, index) => {
    const missedChores = Array.isArray(p.completed)
      ? p.chores?.filter(c => !p.completed.includes(c.name)).length || 0
      : p.chores?.length || 0;

      if (missedChores > 0) {
        logActivity({
          type: "missedChores",
          person: p.name,
          amount: missedChores,
          time: new Date().toISOString()
        });
      }
      

    p.dollarsOwed = (p.dollarsOwed || 0) + missedChores;
    p.paid = false;
    p.completed = [];

    const newChores = [];

    let permanent = [];
    const match = Object.entries(choreData.permanent || {}).find(([key]) =>
      key.toLowerCase() === p.name.toLowerCase()
    );
    if (match) permanent = match[1];
    

    for (const chore of permanent) {
      const taskName = (chore.task || chore.name || "Unnamed Task");
      newChores.push({
        name: taskName,
        task: taskName,
        type: chore.type ?? "unspecified",
        origin: "permanent"
      });
    }

    for (const chore of rotatingAssignments[index]) {
      const taskName = chore.task ?? chore.name ?? "Unnamed Task";
      newChores.push({
        name: taskName,
        task: taskName,
        type: chore.type ?? "unspecified",
        origin: "rotating"
      });
    }

    p.chores = newChores;
  });

  logActivity({ type: "manualReset", time: new Date().toISOString() });

  if (typeof window.saveChoreData === "function") {
    window.saveChoreData("myHouseholdId", { people }).then(() => {
      renderDashboard();
      showCustomAlert("🔁 Weekly reset complete. Missed chore amounts updated.");
    }).catch(err => {
      console.error("[manualResetChores]: ❌ Firebase sync failed", err);
      renderDashboard();
      showCustomAlert("⚠️ Weekly reset saved locally but not synced.");
    });
  } else {
    renderDashboard();
    showCustomAlert("🔁 Weekly reset complete. Missed chore amounts updated.");
  }
}

// applyDollarAdjustment
// Adjusts the dollar amount owed for the selected person
function applyDollarAdjustment() {
  const name = document.getElementById("adminDollarSelect").value;
  const amount = parseFloat(document.getElementById("adminDollarInput").value);

  if (!name || isNaN(amount)) return showCustomAlert("⚠️ Select a person and enter a valid amount.");

  const person = people.find(p => p.name === name);
  if (person) {
    person.dollarsOwed = amount;
    person.paid = amount === 0;
    savePeople();
    showCustomAlert(`💵 Updated ${name}'s owed amount to $${amount}`);
  }
}

// applySkipChore
// Skips a person's chores for a time period with a reason
function applySkipChore() {
  const name = document.getElementById("skipPersonSelect").value;
  const duration = document.getElementById("skipDurationSelect").value;
  const reason = document.getElementById("skipReasonSelect").value;

  const person = people.find(p => p.name === name);
  if (!person) return showCustomAlert("⚠️ No person selected.");

  // Log the skip event (optional)
  const log = {
    type: "skipped",
    person: name,
    duration,
    reason,
    time: new Date().toISOString()
  };

  const logs = JSON.parse(localStorage.getItem("activityLog") || "[]");
  logs.unshift(log);
  localStorage.setItem("activityLog", JSON.stringify(logs));

  // Store skip record (optional future use)
  if (!person.skipLog) person.skipLog = [];
  person.skipLog.push(log);

  savePeople();
  showCustomAlert(`💤 ${name}'s chores skipped for ${duration} (${reason})`);
}

// forceReassignChores
// Hard reset for rotating chores and local data. Triggers full page reload.
const forceReassignChores = () => {
  logActivity({ type: "reassigned", triggeredBy: "admin" });


  showCustomAlert("Rotating chores cleared. Reload manually if needed.");
};



/* ============================================================================
   03. UI Rendering
============================================================================ */
// renderDashboard
// Renders the main dashboard cards for each person.
const renderDashboard = () => {
  document.getElementById("history").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");

  const dashboardSection = document.getElementById("dashboard");
  const dashboard = document.getElementById("dashboardContent");
  dashboard.innerHTML = "";

  // Remove any previous week banner
  const existingBanner = dashboardSection.querySelector(".chore__week-banner");
  if (existingBanner) existingBanner.remove();

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
      if (!seen.has(chore.name)) {
        seen.add(chore.name);
        uniqueChores.push(chore);
      }
    }

    const permanentChores = uniqueChores
      .filter(c => c.origin === "permanent")
      .sort((a, b) => a.type.localeCompare(b.type));

    const rotatingChores = ["daily", "weekly", "monthly", "quarterly"]
      .flatMap(group =>
        uniqueChores.filter(c => c.origin === "rotating" && c.type === group)
      );

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

    dashboard.appendChild(card);
    const paidBtn = document.createElement("button");
    paidBtn.className = person.paid ? "chore-btn chore-btn--paid" : "chore-btn chore-btn--unpaid";
    paidBtn.textContent = person.paid ? "✔️ Paid" : "Mark Paid";    
    paidBtn.onclick = () => openPaidModal(person.name);
// Create a wrapper that holds both chores and button
const contentWrapper = document.createElement("div");
contentWrapper.style.display = "flex";
contentWrapper.style.flexDirection = "column";
contentWrapper.style.flexGrow = "1";

// Inject the main card content (already HTML string)
contentWrapper.innerHTML = card.innerHTML;
card.innerHTML = ""; // clear to avoid duplication
card.appendChild(contentWrapper);

// Then append the paid button at the bottom
paidBtn.style.marginTop = "2rem";  // adds space above the button

card.appendChild(paidBtn);


  });
};

// ------------------- Render Chore -------------------
const renderChore = (person) => (choreObj) => {
  const { name, type, locked } = choreObj;
  const isDone = Array.isArray(person.completed) && person.completed.includes(name);
  const isDraggable = !isDone && !locked;
  const originalOwner = choreObj.originalOwner || null;
  const displayName = originalOwner ? `${name} (${originalOwner})` : name;

  return `
    <li 
      class="card__chore ${isDone ? 'chore-done' : ''}" 
      draggable="${isDraggable}"
      ondragstart="${isDraggable ? `onDragStart(event, '${person.id}', '${name}')` : 'event.preventDefault()'}"
      ${!isDraggable ? 'title="This chore is locked or already completed."' : ''}
    >

      <label class="chore-label">
        <input 
          type="checkbox"
          class="chore-checkbox chore--${person.id}" 
          ${isDone || locked ? 'checked' : ''} 
          ${locked ? 'disabled' : ''}
          onchange="completeChore('${person.name}', '${name}')"
        />
        <span>
          <span class="chore-tag chore-tag--${type}">[${type[0]}]</span> 
          ${displayName}
        </span>
      </label>
    </li>
  `;
};

// renderHistory
// Displays global stats, insights, event log, and completed chores per person.
const renderHistory = () => {
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
  const logs = JSON.parse(localStorage.getItem("activityLog") || "[]");
  const logCard = document.createElement("div");
  logCard.className = "history__card";
  logCard.innerHTML = `
    <h3 class="history__title">📜 Activity Log</h3>
    <ul class="history__list">
      ${logs.length === 0
        ? "<li>No activity logged.</li>"
        : logs.slice(0, 10).map(log => {
          const date = new Date(log.time).toLocaleString();
        
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
            default:
              return `<li>📦 ${log.type} — ${JSON.stringify(log)} — <span class="log-date">${date}</span></li>`;
          }
        }).join("")
      }
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

// renderCalendar
// Builds the monthly calendar with chore status, resets, and missed indicators.
const renderCalendar = () => {
  const container = document.getElementById("calendarContent");
  container.innerHTML = "";

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const totalCells = startDay + totalDays;
  const totalWeeks = Math.ceil(totalCells / 7);
  const totalCellsToRender = totalWeeks * 7;

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar__grid";

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  weekdays.forEach(day => {
    const cell = document.createElement("div");
    cell.className = "calendar__header";
    cell.textContent = day;
    calendarGrid.appendChild(cell);
  });

  for (let i = 0; i < totalCellsToRender; i++) {
    const cell = document.createElement("div");

    if (i < startDay) {
      cell.className = "calendar__cell empty";
    } else {
      const day = i - startDay + 1;
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      cell.className = "calendar__cell";

      if (date.getDay() === 0) {
        cell.innerHTML += `<div class="calendar__icon" title="Weekly Reset">🔁</div>`;

        const anchorSunday = new Date("2025-01-05T00:00:00");
        const daysBetween = Math.floor((date - anchorSunday) / (1000 * 60 * 60 * 24));
        const weeksBetween = Math.floor(daysBetween / 7);
        if (weeksBetween % 2 === 0) {
          cell.innerHTML += `<div class="calendar__biweekly" title="Biweekly Reset">🌀</div>`;
        }
      }

      const isPast = date < now;
      const missedChores = people.some(p => {
        const assigned = p.chores.map(c => c.name);
        const completed = p.completed || [];
        return assigned.some(task => !completed.includes(task));
      });

      if (isPast && missedChores) {
        cell.innerHTML += `<div class="calendar__missed" title="Missed chore(s)">🟥</div>`;
      }

      cell.innerHTML += `<div class="calendar__date">${day}</div>`;
    }

    calendarGrid.appendChild(cell);
  }

  container.appendChild(calendarGrid);
};

/* ============================================================================
   04. Chore Completion & Toggling
============================================================================ */
// completeChore
// Toggles whether a chore is completed for a given person.
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

  // Save to Firebase only, then update UI
  if (typeof window.saveChoreData === "function") {
    window.saveChoreData("myHouseholdId", { people }).then(() => {
      renderDashboard();
      showCustomAlert("✅ Chore updated");
    }).catch(err => {
      console.error("[completeChore]: ❌ Firebase sync failed", err);
      renderDashboard();
      showCustomAlert("⚠️ Saved locally only (sync failed)");
    });
  } else {
    console.warn("[completeChore]: ⚠️ Firebase save function not found.");
    renderDashboard();
  }
};

// togglePaid
// Toggles paid state for a person and updates Firebase + UI
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


/* ============================================================================
   05. Sidebar & Modal Control
============================================================================ */
//populateAdminDropdowns
function populateAdminDropdowns() {
  const personOptions = people.map(p => `<option value="${p.name}">${p.name}</option>`).join("");

  const dollarSelect = document.getElementById("adminDollarSelect");
  const skipPersonSelect = document.getElementById("skipPersonSelect");
  const editChoresSelect = document.getElementById("editChoresPersonSelect");

  if (dollarSelect) dollarSelect.innerHTML = personOptions;
  if (skipPersonSelect) skipPersonSelect.innerHTML = personOptions;
  if (editChoresSelect) editChoresSelect.innerHTML = personOptions;
}

// toggleSidebar
// Toggles sidebar visibility.
const toggleSidebar = () => {
  document.getElementById("sidebar").classList.toggle("open");
};

// closeModal
const closeModal = () => {
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("show"));
};

// showSection
// Shows one section and hides the others (dashboard, history, calendar).
const showSection = (idToShow) => {
  const sections = ["dashboard", "history", "calendar", "admin"];

  sections.forEach(id => {
    const el = document.getElementById(id);
    el.classList.toggle("hidden", id !== idToShow);

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

  if (idToShow === "dashboard") renderDashboard();
  if (idToShow === "history") renderHistory();
  if (idToShow === "calendar") renderCalendar();
  if (idToShow === "admin") populateAdminDropdowns(); // ✅ updated full function

  // ✅ Close sidebar if open
  document.getElementById("sidebar")?.classList.remove("open");
  
  // ✅ Close any open modal (like Mark Paid or Reassign)
  document.querySelectorAll(".modal.show").forEach(modal => modal.classList.remove("show"));  
};

// viewHistory
// Shows the history panel and closes sidebar.
const viewHistory = () => {
  showSection("history");
  toggleSidebar();
};

// viewCalendar
// Shows the calendar view and closes sidebar.
const viewCalendar = () => {
  toggleSidebar();
  showSection("calendar");
};

// openReassignModal
// Opens the reassignment confirmation dialog.
const openReassignModal = () => {
  toggleSidebar();
  document.getElementById("reassignModal").classList.add("show");
};

// openManualResetModal
const openManualResetModal = () => {
  document.getElementById("manualResetModal").classList.add("show");
};

// confirmManualReset
const confirmManualReset = () => {
  manualResetChores();
  closeModal();
};

// openSkipChoreModal 
const openSkipChoreModal = () => {
  document.getElementById("skipChoreModal").classList.add("show");
};

// openWeeklySummaryModal
const openWeeklySummaryModal = () => {
  const logs = JSON.parse(localStorage.getItem("activityLog") || "[]");
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


// toggleSandboxMode
const toggleSandboxMode = () => {
  const isEnabled = document.getElementById("sandboxToggle").checked;
  localStorage.setItem("sandboxMode", isEnabled ? "true" : "false");

  logActivity({
    type: "sandbox",
    status: isEnabled ? "enabled" : "disabled"
  });

  showCustomAlert(`Sandbox Mode ${isEnabled ? "Enabled" : "Disabled"}`);
};




// openResetAllModal 
const openResetAllModal = () => {
  document.getElementById("resetModal").classList.add("show");
};

// confirmSkipChore 
const confirmSkipChore = () => {
  applySkipChore();
  closeModal();
};

//openDollarAdjustModal
const openDollarAdjustModal = () => {
  document.getElementById("dollarAdjustModal").classList.add("show");
};

const confirmDollarAdjustment = () => {
  applyDollarAdjustment();
  closeModal();
};

// openPreviewResetModal
const openPreviewResetModal = () => {
  const skippedNames = getSkippedPeopleThisWeek();
  const preview = people.map(p => {
    const isSkipped = skippedNames.includes(p.name.toLowerCase());
    return `<li><strong>${p.name}</strong>: ${isSkipped ? "⏸ Skipped (no reset)" : "✅ Will reset chores"}</li>`;
  });

  document.getElementById("previewResetContent").innerHTML = `<ul>${preview.join("")}</ul>`;
  document.getElementById("previewResetModal").classList.add("show");
};

const getSkippedPeopleThisWeek = () => {
  const logs = JSON.parse(localStorage.getItem("activityLog") || "[]");

  return logs
    .filter(log =>
      log.type === "skipped" &&
      ["day", "week"].includes(log.duration) &&
      new Date(log.time) >= new Date(getStartOfWeek())
    )
    .map(log => log.person.toLowerCase());
};

// confirmReassign
// Confirms chore reassignment and triggers a full reload.
const confirmReassign = () => {
  logActivity({ type: "reassigned", triggeredBy: "admin" });


  closeModal();

  showCustomAlert("Rotating chores cleared. Reload manually if needed.");
};


// setupSwipeSidebar
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

// openPaidModal
// Opens the "Mark Paid" confirmation modal for a selected person.
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

// confirmMarkPaid 
// Confirms the paid toggle and closes the modal.
const confirmMarkPaid = () => {
  if (pendingPaidName) {
    togglePaid(pendingPaidName);
    pendingPaidName = null;
  }
  closeModal();
};

// Close Sidebar When Clicking Outside 
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

//showCustomAlert
function showCustomAlert(message, duration = 2500) {
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


/* ============================================================================
   06. Drag-and-Drop Logic
============================================================================ */
let draggedChoreInfo = null;

// onDragStart
// Stores drag source data and sets drag transfer payload.
const onDragStart = (event, fromId, taskName) => {
  draggedChoreInfo = { fromId, taskName };
  event.dataTransfer.setData("text/plain", taskName);
};

// onDragOver
// Required to allow drop target to accept dragged items.
const onDragOver = (event) => {
  event.preventDefault();
};

// onDrop
// Transfers a chore to another person’s view (with original ownership).
const onDrop = (event, toId) => {
  event.preventDefault();

  if (!draggedChoreInfo) {
    console.warn("[app.js]: ⚠️ Drag event dropped with no chore info.");
    draggedChoreInfo = null; // ensure clean state
    return;
  }
  
  const { fromId, taskName } = draggedChoreInfo;

  if (fromId === toId) {
    console.log("[app.js]: 🟡 Drag ignored — source and target are the same.");
    return;
  }

  const helper = people.find(p => p.id === toId);
  if (!helper) {
    console.error(`[app.js]: ❌ Helper person not found: ${toId}`);
    return;
  }

  const alreadyDone = helper.completed.includes(taskName);
  if (alreadyDone) {
    console.log(`[app.js]: ✅ ${taskName} already completed by ${helper.name}`);
    return;
  }

  helper.completed.push(taskName);

  // ------------------- Inject Helped Chore into View -------------------
  const originalOwner = people.find(p => p.id === fromId);
  if (!originalOwner) {
    console.error(`[app.js]: ❌ Original owner not found: ${fromId}`);
    return;
  }

  const originalChore = originalOwner.chores.find(c => c.name === taskName);
  if (!originalChore) {
    console.error(`[app.js]: ❌ Chore not found in original owner: ${taskName}`);
    return;
  }

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
  
    // 🆕 Remove chore from original owner's list
    originalOwner.chores = originalOwner.chores.filter(c => c.name !== taskName);
  
    // 🆕 ✅ Add to activity log
    logActivity({
      type: "transferred",
      from: originalOwner.name,
      to: helper.name,
      task: taskName
    });
  
    console.log(`[app.js]: 🛠️ ${helper.name} helped with ${taskName} from ${originalOwner.name}`);
  }
  

  helper.dollarsOwed = Math.max((helper.dollarsOwed || 0) - 1, 0);

  savePeople(); // <-- This is the proper global function used elsewhere
  renderDashboard();  
  draggedChoreInfo = null;
};

/* ============================================================================
   07. Init & Data Loading
   Initializes global `people` array and triggers data loading and setup.
============================================================================ */

// ------------------- Global Variables -------------------
let people = [];
let savedPeople = [];
let choreData = {}; // ✅ <--- ADD THIS LINE

// ------------------- Sandbox Mode -------------------
const isSandboxMode = localStorage.getItem("sandboxMode") === "true";

document.addEventListener("DOMContentLoaded", () => {
  const banner = document.getElementById("sandboxBanner");
  const checkbox = document.getElementById("sandboxToggle");

  if (isSandboxMode && banner) banner.classList.remove("hidden");
  if (checkbox) checkbox.checked = isSandboxMode;
});


// Periodically check for reset conditions (e.g., Sunday midnight)
setInterval(autoResetChoresIfNeeded, 60000); // Check every 60 seconds

// ------------------- Function: Init Async Loader -------------------
// Loads people and chore data from Firebase (or fallback to localStorage),
// then processes and initializes them for current week state.
(async () => {
  try {
    // Attempt to load from cloud sync (Firebase)
    const cloudData = await window.loadChoreData("myHouseholdId");
    savedPeople = (cloudData && cloudData.people) || [];
  } catch (err) {
    console.error("[app.js]: ❌ Failed to load from Firebase. Cannot continue.", err);
    showCustomAlert("❌ Could not load chore data from cloud.");
    return;
  }

  // Fetch data.json from project (permanent + rotating chore templates)
  fetch("data.json")
  .then(res => {
    if (!res.ok) throw new Error("Invalid response from data.json");
    return res.json();
  })
  .then(async (data) => {
    const cloudData = await window.loadChoreData("myHouseholdId");
    if (!cloudData || !Array.isArray(cloudData.people)) {
      throw new Error("❌ Firebase returned no people data.");
    }

    people = cloudData.people.map(p => ({ ...p }));
    choreData = data.chores;

    renderDashboard();
    autoResetChoresIfNeeded();
  })
  .catch(err => {
    console.error("[app.js]: ❌ Failed to load chore data", err);
    showCustomAlert("❌ Failed to load chores or people from cloud. Please try again.");
  });
})();

/* ============================================================================
   08. Global Exports (window bindings)
============================================================================ */

// ------------------- Core Completion & Toggling -------------------
window.completeChore = completeChore;
window.togglePaid = togglePaid;

// ------------------- Sidebar & Modal Controls -------------------
window.toggleSidebar = toggleSidebar;
window.closeModal = closeModal;
window.showSection = showSection;
window.viewHistory = viewHistory;
window.viewCalendar = viewCalendar;

// ------------------- Chore Reassignment -------------------
window.forceReassignChores = forceReassignChores;
window.openReassignModal = openReassignModal;
window.confirmReassign = confirmReassign;
window.reassignRotatingChores = reassignRotatingChores;

// ------------------- Admin Controls -------------------
window.applyDollarAdjustment = applyDollarAdjustment;
window.toggleAutoReset = toggleAutoReset;
window.openEditChoresModal = openEditChoresModal;
window.closeEditChoresModal = closeEditChoresModal;
window.saveEditedChores = saveEditedChores;
window.previewReset = previewReset;
window.confirmResetAll = confirmResetAll;
window.applySkipChore = applySkipChore;
window.logActivity = logActivity;
window.openManualResetModal = openManualResetModal;
window.confirmManualReset = confirmManualReset;
window.openSkipChoreModal = openSkipChoreModal;
window.confirmSkipChore = confirmSkipChore;
window.openDollarAdjustModal = openDollarAdjustModal;
window.confirmDollarAdjustment = confirmDollarAdjustment;
window.openPreviewResetModal = openPreviewResetModal;
window.openResetAllModal = openResetAllModal;
window.openWeeklySummaryModal = openWeeklySummaryModal;
window.toggleSandboxMode = toggleSandboxMode;
window.confirmMarkPaid = confirmMarkPaid;

window.onDragStart = onDragStart;
window.onDragOver = onDragOver;
window.onDrop = onDrop;

// ------------------- Service Worker Registration -------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => console.log("[PWA] Service Worker registered ✅"))
      .catch(err => console.error("[PWA] Service Worker failed", err));
  });
}

