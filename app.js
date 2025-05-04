/* ============================================================================ */
/* app.js — Logic for Chore Tracker: Rendering, Points, Dashboard Controls      */
/* ============================================================================ */

// ============================================================================
// ------------------- Section: Data Load -------------------
// Loads initial data from Firebase (or local fallback) and merges with data.json.
// ============================================================================


fetch("data.json")
  .then(res => {
    if (!res.ok) {
      throw new Error("Invalid response from data.json");
    }
    return res.json();
  })
  .then(async (data) => {
    if (!data || !Array.isArray(data.people) || typeof data.chores !== "object") {
      console.error("[app.js]: ❌ Invalid data.json structure", data);
      return;
    }

    const { people: personList, chores } = data;
    const isNewWeek = shouldReassignRotatingChores();

    people = personList.map((person, index) => {
      const baseChores = (chores.permanent?.[person.id] || []).map(c => ({
        name: c.task,
        type: c.type,
        origin: "permanent"
      }));

      const savedPerson = savedPeople.find(p => p.id === person.id) || {};
      let rotatingChores = [];

      // ------------------- Rotating Chore Assignment -------------------
      if (isNewWeek) {
        rotatingChores = chores.rotating
          .filter((c, i) => {
            const isBiweekly = c.type === "biweekly";
            return (!isBiweekly || isBiweeklyWeek()) && i % personList.length === index;
          })
          .map(c => ({
            name: c.task,
            type: c.type,
            origin: "rotating"
          }));
      } else {
        const savedChores = savedPerson.chores || [];
        rotatingChores = savedChores.filter(c => c.origin === "rotating");
      }

      return {
        ...person,
        chores: [...baseChores, ...rotatingChores],
        completed: isNewWeek ? [] : (savedPerson.completed || []),
        dollarsOwed: savedPerson.dollarsOwed ?? person.dollarsOwed ?? 0,
        points: 0
      };
    });

    if (isNewWeek) {
      updateChoreCycleStartDate();
      try {
        await window.saveChoreData("myHouseholdId", { people });
        console.log("[app.js]: ✅ Cloud chore data saved for new week.");
      } catch (err) {
        console.error("[app.js]: ⚠️ Firebase save failed. Saving to localStorage instead.", err);
        localStorage.setItem("choreData", JSON.stringify(people));
      }
    }

    renderDashboard();
  })
  .catch(err => {
    console.error("[app.js]: ❌ Failed to load or process data.json", err);
    alert("❌ Failed to load chore data. Please check your file or reload.");
  });

  // ============================================================================
// ------------------- Section: Date Utilities -------------------
// Handles all time-based logic: weekly cycles, biweekly checks, and resets.
// ============================================================================

// ------------------- Function: getStartOfWeek -------------------
// Returns the YYYY-MM-DD string for the most recent Sunday.
const getStartOfWeek = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // Sunday = 0
  const diff = now.getDate() - dayOfWeek;
  const sunday = new Date(now.setDate(diff));
  sunday.setHours(0, 0, 0, 0);
  return sunday.toISOString().split("T")[0];
};

// ------------------- Function: isBiweeklyWeek -------------------
// Determines whether this is a biweekly reset week.
const isBiweeklyWeek = () => {
  const anchorSunday = new Date("2024-01-07T00:00:00"); // first-ever chore week
  const now = new Date();
  const diffWeeks = Math.floor((now - anchorSunday) / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks % 2 === 0;
};

// ------------------- Function: shouldReassignRotatingChores -------------------
// Checks if a new weekly cycle has started since last recorded.
const shouldReassignRotatingChores = () => {
  const storedStart = localStorage.getItem("choreCycleStartDate");
  const currentStart = getStartOfWeek();
  return storedStart !== currentStart;
};

// ------------------- Function: updateChoreCycleStartDate -------------------
// Sets localStorage to the current week's start date (Sunday).
const updateChoreCycleStartDate = () => {
  const currentStart = getStartOfWeek();
  localStorage.setItem("choreCycleStartDate", currentStart);
};

// ------------------- Function: autoResetChoresIfNeeded -------------------
// Resets completed chores automatically at Sunday 12:00 AM.
const autoResetChoresIfNeeded = () => {
  const now = new Date();
  const isSundayMidnight =
    now.getDay() === 0 &&
    now.getHours() === 0 &&
    now.getMinutes() === 0;

  const storedStart = localStorage.getItem("choreCycleStartDate");
  const currentStart = getStartOfWeek();

  if (isSundayMidnight && storedStart !== currentStart) {
    console.log("[app.js]: ⏰ Auto-resetting chores at Sunday midnight");
    updateChoreCycleStartDate();

    people.forEach(p => {
      p.completed = [];
    });

    localStorage.setItem("choreData", JSON.stringify(people));
    renderDashboard();
  }
};
 
// ============================================================================
// ------------------- Section: UI Rendering -------------------
// Renders dashboard, chore cards, history panel, and calendar view.
// ============================================================================

// ------------------- Function: renderDashboard -------------------
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
    <div class="week-banner__line"><i class="fas fa-calendar-day"></i> Today — ${today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
    <div class="week-banner__line">Weekly Chores — ${formatDate(startOfWeek)} to ${formatDate(endOfWeek)}</div>
    <div class="week-banner__line">Biweekly Chores — ${formatDate(biweeklyStart)} to ${formatDate(biweeklyEnd)}</div>
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
        <span class="card__owed">$${person.dollarsOwed} owed</span>
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
  });
};

// ------------------- Function: renderChore -------------------
// Renders a single chore line item for a person.
const renderChore = (person) => (choreObj) => {
  const { name, type, locked } = choreObj;
  const isDone = person.completed?.includes(name);
  const isDraggable = !isDone && !locked;
  const originalOwner = choreObj.originalOwner || null;
  const displayName = originalOwner ? `${name} (${originalOwner})` : name;

  return `
    <li 
      class="card__chore ${isDone ? 'chore-done' : ''}" 
      ${isDraggable ? 'draggable="true"' : 'draggable="false"'}
      ${isDraggable ? `ondragstart="onDragStart(event, '${person.id}', '${name}')"` : ''}
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

// ------------------- Function: renderHistory -------------------
// Displays each person's completed chores in the history panel.
const renderHistory = () => {
  const container = document.getElementById("historyContent");
  container.innerHTML = "";

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
    container.appendChild(wrapper);
  });
};

// ------------------- Function: renderCalendar -------------------
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

// ============================================================================
// ------------------- Section: Chore Completion -------------------
// Handles toggling a chore's completion status and updates the UI/storage.
// ============================================================================

// ------------------- Function: completeChore -------------------
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
  }

  localStorage.setItem("choreData", JSON.stringify(people));
  renderDashboard();
};

window.completeChore = completeChore;

  // ============================================================================
// ------------------- Section: Sidebar Controls -------------------
// Handles navigation, modal triggers, resets, and section toggling.
// ============================================================================

// ------------------- Function: toggleSidebar -------------------
// Toggles sidebar visibility.
const toggleSidebar = () => {
  document.getElementById("sidebar").classList.toggle("open");
};

window.toggleSidebar = toggleSidebar; // <-- ADD THIS LINE


// ------------------- Function: resetChores -------------------
// Opens the reset confirmation modal.
const resetChores = () => {
  toggleSidebar();
  document.getElementById("resetModal").classList.add("show");
};

window.resetChores = resetChores;

// ------------------- Function: confirmReset -------------------
// Resets weekly completion and adds $1 for each missed chore.
const confirmReset = () => {
  people.forEach(person => {
    const completed = person.completed || [];

    person.chores.forEach(chore => {
      const wasCompleted = completed.includes(chore.name);
      if (!wasCompleted) {
        person.dollarsOwed = (person.dollarsOwed || 0) + 1;
      }
    });

    person.completed = [];
  });

  localStorage.setItem("choreData", JSON.stringify(people));
  closeModal();
  renderDashboard();

  console.log("[app.js]: ✅ Chores reset and missed chores tallied.");
};

window.confirmReset = confirmReset;

// ------------------- Function: closeModal -------------------
// Hides the modal dialog.
const closeModal = () => {
  document.getElementById("resetModal").classList.remove("show");
};

window.closeModal = closeModal;

// ------------------- Function: showSection -------------------
// Shows one section and hides the others (dashboard, history, calendar).
const showSection = (idToShow) => {
  const sections = ["dashboard", "history", "calendar"];

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
};

window.showSection = showSection;

// ------------------- Function: viewHistory -------------------
// Shows the history panel and closes sidebar.
const viewHistory = () => {
  showSection("history");
  toggleSidebar();
};

window.viewHistory = viewHistory;

// ------------------- Function: viewCalendar -------------------
// Shows the calendar view and closes sidebar.
const viewCalendar = () => {
  toggleSidebar();
  showSection("calendar");
};

window.viewCalendar = viewCalendar;

// ------------------- Function: manualOverride -------------------
// Placeholder for override functionality.
const manualOverride = () => {
  toggleSidebar();
  alert("🛠️ Manual override — feature coming soon!");
};

window.manualOverride = manualOverride;

  /* ============================================================================
     05. Future Features (Placeholders)
  ============================================================================ */
  
  // TODO: Save completed chores to localStorage
  // TODO: Track missed chores and deduct points
  // TODO: Implement daily/weekly/monthly rotation logic
  // TODO: Add ability to cover chores for others (earn bonus)
  // TODO: Track and display completed chore history

// ============================================================================
// ------------------- Section: Drag-and-Drop Chores -------------------
// Allows chores to be dragged between people and reassigns visual ownership.
// ============================================================================

let draggedChoreInfo = null;

// ------------------- Function: onDragStart -------------------
// Stores drag source data and sets drag transfer payload.
const onDragStart = (event, fromId, taskName) => {
  draggedChoreInfo = { fromId, taskName };
  event.dataTransfer.setData("text/plain", taskName);
};

// ------------------- Function: onDragOver -------------------
// Required to allow drop target to accept dragged items.
const onDragOver = (event) => {
  event.preventDefault();
};

// ------------------- Function: onDrop -------------------
// Transfers a chore to another person’s view (with original ownership).
const onDrop = (event, toId) => {
  event.preventDefault();

  if (!draggedChoreInfo) {
    console.warn("[app.js]: ⚠️ Drag event dropped with no chore info.");
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

    console.log(`[app.js]: 🛠️ ${helper.name} helped with ${taskName} from ${originalOwner.name}`);
  }

  helper.dollarsOwed = Math.max((helper.dollarsOwed || 0) - 1, 0);

  localStorage.setItem("choreData", JSON.stringify(people));
  renderDashboard();
  draggedChoreInfo = null;
};

// ------------------- Register Service Worker -------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => console.log("[PWA] Service Worker registered ✅"))
      .catch(err => console.error("[PWA] Service Worker failed", err));
  });
}

// ============================================================================
// ------------------- Init: Load Data & Start App -------------------
// Initializes global people array and triggers chore logic
// ============================================================================

// ------------------- Global Variables -------------------
let people = [];
let savedPeople = [];

setInterval(autoResetChoresIfNeeded, 60000); // Run chore reset checks every minute

(async () => {
  try {
    const cloudData = await window.loadChoreData("myHouseholdId");
    savedPeople = cloudData?.people || [];
  } catch (err) {
    console.error("[app.js]: ⚠️ Failed to load from Firebase. Falling back to localStorage.", err);
    const localData = localStorage.getItem("choreData");
    savedPeople = localData ? JSON.parse(localData) : [];
  }

  fetch("data.json")
    .then(res => {
      if (!res.ok) throw new Error("Invalid response from data.json");
      return res.json();
    })
    .then(async (data) => {
      const { people: personList, chores } = data;
      const isNewWeek = shouldReassignRotatingChores();

      people = personList.map((person, index) => {
        const baseChores = (chores.permanent?.[person.id] || []).map(c => ({
          name: c.task,
          type: c.type,
          origin: "permanent"
        }));

        const savedPerson = savedPeople.find(p => p.id === person.id) || {};
        let rotatingChores = [];
        
// ------------------- Deterministic Rotating Chores -------------------
if (isNewWeek) {
  rotatingChores = chores.rotating
    .filter((c, i) => {
      const isBiweekly = c.type === "biweekly";
      return (!isBiweekly || isBiweeklyWeek()) && i % personList.length === index;
    })
    .map(c => ({
      name: c.task,
      type: c.type,
      origin: "rotating"
    }));

  // Save assigned people + chores to localStorage immediately
  savedPerson.chores = [...baseChores, ...rotatingChores];
  localStorage.setItem("choreData", JSON.stringify(
    personList.map(p => {
      const sp = p.id === person.id ? savedPerson : savedPeople.find(e => e.id === p.id) || {};
      return {
        ...p,
        chores: sp.chores || [],
        completed: sp.completed || [],
        dollarsOwed: sp.dollarsOwed ?? p.dollarsOwed ?? 0
      };
    })
  ));
} else {
  const savedChores = savedPerson.chores || [];
  rotatingChores = savedChores.filter(c => c.origin === "rotating");
}


        return {
          ...person,
          chores: [...baseChores, ...rotatingChores],
          completed: isNewWeek ? [] : (savedPerson.completed || []),
          dollarsOwed: savedPerson.dollarsOwed ?? person.dollarsOwed ?? 0,
          points: 0
        };
      });

      if (isNewWeek) {
        updateChoreCycleStartDate();
        try {
          await window.saveChoreData("myHouseholdId", { people });
        } catch (err) {
          console.error("[app.js]: ⚠️ Firebase save failed. Saving locally.", err);
          localStorage.setItem("choreData", JSON.stringify(people));
        }
      }

      renderDashboard();
    })
    .catch(err => {
      console.error("[app.js]: ❌ Failed to load or process data.json", err);
      alert("❌ Failed to load chore data. Please check your file or reload.");
    });
})();

