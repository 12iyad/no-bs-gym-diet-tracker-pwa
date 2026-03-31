(function () {
  'use strict';

  var STORAGE_KEY = 'noBsTrackerState';
  var SUMMARY_MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs'];

  var DEFAULT_EXERCISES = [
    { id: 'seated-chest-press', name: 'Seated Chest Press', muscleGroups: ['chest', 'triceps', 'shoulders'] },
    { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroups: ['back', 'biceps'] },
    { id: 'seated-row', name: 'Seated Row', muscleGroups: ['back', 'biceps'] },
    { id: 'bicep-curl', name: 'Bicep Curl', muscleGroups: ['biceps'] },
    { id: 'hammer-curl', name: 'Hammer Curl', muscleGroups: ['biceps', 'forearms'] },
    { id: 'tricep-pushdown', name: 'Tricep Pushdown', muscleGroups: ['triceps'] },
    { id: 'face-pull', name: 'Face Pull', muscleGroups: ['shoulders', 'back'] },
    { id: 'lateral-raise', name: 'Lateral Raise', muscleGroups: ['shoulders'] },
    { id: 'leg-press', name: 'Leg Press', muscleGroups: ['legs'] },
    { id: 'hamstring-curl', name: 'Hamstring Curl', muscleGroups: ['legs'] },
    { id: 'calf-raise', name: 'Calf Raise', muscleGroups: ['legs'] },
    { id: 'cable-crunch', name: 'Cable Crunch', muscleGroups: ['abs'] }
  ];

  var DEFAULT_MEALS = [
    { id: 'breakfast', name: 'Breakfast' },
    { id: 'lunch', name: 'Lunch' },
    { id: 'dinner', name: 'Dinner' },
    { id: 'snacks', name: 'Snacks' }
  ];

  var state = null;
  var activeTab = 'workout';

  /** @type {string|null} */
  var sheetLogExerciseId = null;
  /** @type {string|null} */
  var sheetDetailExerciseId = null;
  var chartRange = '30';
  /** @type {string|null} */
  var sheetFoodMealId = null;

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now()) + '-' + String(Math.random()).slice(2, 10);
  }

  function todayStr() {
    return new Date().toLocaleDateString('en-CA');
  }

  /** Monday (YYYY-MM-DD) and Sunday (YYYY-MM-DD) for the week containing `dayStr`. */
  function weekRangeContaining(dayStr) {
    var parts = dayStr.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    var dt = new Date(y, m, d);
    var dow = dt.getDay();
    var mondayOffset = dow === 0 ? -6 : 1 - dow;
    var monday = new Date(dt);
    monday.setDate(dt.getDate() + mondayOffset);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    function fmt(x) {
      var yy = x.getFullYear();
      var mm = String(x.getMonth() + 1).padStart(2, '0');
      var dd = String(x.getDate()).padStart(2, '0');
      return yy + '-' + mm + '-' + dd;
    }
    return { start: fmt(monday), end: fmt(sunday) };
  }

  function dateInRange(iso, start, end) {
    return iso >= start && iso <= end;
  }

  function parseNum(v) {
    if (v === '' || v === null || v === undefined) return NaN;
    var n = parseFloat(String(v).replace(',', '.'));
    return n;
  }

  function createEmptyState() {
    return {
      exercises: JSON.parse(JSON.stringify(DEFAULT_EXERCISES)),
      workoutLogs: [],
      bodyLogs: [],
      meals: JSON.parse(JSON.stringify(DEFAULT_MEALS)),
      foodLogs: []
    };
  }

  function isValidImportedRoot(raw) {
    return (
      raw &&
      typeof raw === 'object' &&
      Array.isArray(raw.exercises) &&
      Array.isArray(raw.workoutLogs) &&
      Array.isArray(raw.bodyLogs)
    );
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return createEmptyState();
    var s = raw;
    if (!Array.isArray(s.exercises)) s.exercises = JSON.parse(JSON.stringify(DEFAULT_EXERCISES));
    if (!Array.isArray(s.workoutLogs)) s.workoutLogs = [];
    if (!Array.isArray(s.bodyLogs)) s.bodyLogs = [];
    if (!Array.isArray(s.meals) || s.meals.length === 0) s.meals = JSON.parse(JSON.stringify(DEFAULT_MEALS));
    if (!Array.isArray(s.foodLogs)) s.foodLogs = [];
    return s;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) state = createEmptyState();
      else state = migrate(JSON.parse(raw));
    } catch (e) {
      state = createEmptyState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getExerciseById(id) {
    return state.exercises.find(function (e) {
      return e.id === id;
    });
  }

  function compareSets(a, b) {
    if (a.weight !== b.weight) return a.weight > b.weight ? 1 : -1;
    if (a.reps !== b.reps) return a.reps > b.reps ? 1 : -1;
    return 0;
  }

  /** Best set: max weight, then max reps. */
  function bestSetForExercise(exerciseId) {
    var logs = state.workoutLogs.filter(function (l) {
      return l.exerciseId === exerciseId;
    });
    if (!logs.length) return null;
    return logs.reduce(function (best, cur) {
      if (!best) return cur;
      return compareSets(cur, best) > 0 ? cur : best;
    }, null);
  }

  /** Last logged: latest by (date, id). */
  function lastSetForExercise(exerciseId) {
    var logs = state.workoutLogs.filter(function (l) {
      return l.exerciseId === exerciseId;
    });
    if (!logs.length) return null;
    return logs.reduce(function (last, cur) {
      if (!last) return cur;
      if (cur.date > last.date) return cur;
      if (cur.date < last.date) return last;
      return String(cur.id) > String(last.id) ? cur : last;
    }, null);
  }

  function filterWorkoutsThisWeek() {
    var t = todayStr();
    var wr = weekRangeContaining(t);
    return state.workoutLogs.filter(function (l) {
      return dateInRange(l.date, wr.start, wr.end);
    });
  }

  function gymSessionsThisWeek() {
    var logs = filterWorkoutsThisWeek();
    var days = {};
    logs.forEach(function (l) {
      days[l.date] = true;
    });
    return Object.keys(days).length;
  }

  function setCountsByMuscleThisWeek() {
    var counts = {};
    SUMMARY_MUSCLES.forEach(function (m) {
      counts[m] = 0;
    });
    var logs = filterWorkoutsThisWeek();
    logs.forEach(function (l) {
      var ex = getExerciseById(l.exerciseId);
      if (!ex || !ex.muscleGroups) return;
      ex.muscleGroups.forEach(function (mg) {
        if (counts[mg] !== undefined) counts[mg] += 1;
      });
    });
    return counts;
  }

  /** All muscle groups touched this week (including abs, forearms) — for workout tab strip. */
  function setCountsAllMusclesThisWeek() {
    var counts = {};
    filterWorkoutsThisWeek().forEach(function (l) {
      var ex = getExerciseById(l.exerciseId);
      if (!ex || !ex.muscleGroups) return;
      ex.muscleGroups.forEach(function (mg) {
        counts[mg] = (counts[mg] || 0) + 1;
      });
    });
    return counts;
  }

  function latestBodyweight() {
    var sorted = state.bodyLogs
      .slice()
      .filter(function (b) {
        return typeof b.bodyweight === 'number' && !isNaN(b.bodyweight);
      })
      .sort(function (a, b) {
        return b.date.localeCompare(a.date);
      });
    return sorted[0] ? sorted[0].bodyweight : null;
  }

  function bodyLogForDate(dateStr) {
    return state.bodyLogs.find(function (b) {
      return b.date === dateStr;
    });
  }

  function getTodayFoodTotals() {
    var t = todayStr();
    var p = 0;
    var c = 0;
    var f = 0;
    var k = 0;
    state.foodLogs
      .filter(function (x) {
        return x.date === t;
      })
      .forEach(function (x) {
        p += Number(x.protein) || 0;
        c += Number(x.carbs) || 0;
        f += Number(x.fat) || 0;
        k += Number(x.calories) || 0;
      });
    return { protein: p, carbs: c, fat: f, calories: k };
  }

  function todayProteinSummary() {
    var ft = getTodayFoodTotals();
    if (ft.protein > 0) return ft.protein;
    var bl = bodyLogForDate(todayStr());
    if (bl && typeof bl.protein === 'number') return bl.protein;
    return null;
  }

  /** Per day: best top-set weight for exercise (max weight, tie-break reps). */
  function chartSeriesForExercise(exerciseId, rangeKey) {
    var logs = state.workoutLogs.filter(function (l) {
      return l.exerciseId === exerciseId;
    });
    var byDay = {};
    logs.forEach(function (l) {
      var cur = byDay[l.date];
      if (!cur) byDay[l.date] = { weight: l.weight, reps: l.reps };
      else if (l.weight > cur.weight) byDay[l.date] = { weight: l.weight, reps: l.reps };
      else if (l.weight === cur.weight && l.reps > cur.reps) byDay[l.date] = { weight: l.weight, reps: l.reps };
    });
    var dates = Object.keys(byDay).sort();
    var t = todayStr();
    var cutoff = null;
    if (rangeKey === '30') {
      var dt = new Date();
      dt.setDate(dt.getDate() - 30);
      cutoff = dt.toLocaleDateString('en-CA');
    } else if (rangeKey === '90') {
      var dt90 = new Date();
      dt90.setDate(dt90.getDate() - 90);
      cutoff = dt90.toLocaleDateString('en-CA');
    }
    if (cutoff) dates = dates.filter(function (d) {
      return d >= cutoff && d <= t;
    });

    return dates.map(function (d) {
      return { date: d, weight: byDay[d].weight, reps: byDay[d].reps };
    });
  }

  function bestWeightInRange(exerciseId, rangeKey) {
    var s = chartSeriesForExercise(exerciseId, rangeKey);
    if (!s.length) return null;
    return s.reduce(function (m, p) {
      return p.weight > m ? p.weight : m;
    }, s[0].weight);
  }

  function drawExerciseChart(canvas, exerciseId, rangeKey) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(280, Math.floor(rect.width)) || 360;
    var h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var series = chartSeriesForExercise(exerciseId, rangeKey);
    var empty = document.getElementById('exercise-chart-empty');
    if (series.length === 0) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    var padL = 36;
    var padR = 10;
    var padT = 14;
    var padB = 28;
    var gw = w - padL - padR;
    var gh = h - padT - padB;

    var weights = series.map(function (p) {
      return p.weight;
    });
    var minW = Math.min.apply(null, weights);
    var maxW = Math.max.apply(null, weights);
    if (minW === maxW) {
      minW = minW - 1;
      maxW = maxW + 1;
    }

    ctx.fillStyle = '#0d0d10';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2a2a34';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var y = padT + (gh * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#9b9bab';
    ctx.font = '10px system-ui,sans-serif';
    for (var j = 0; j <= 4; j++) {
      var val = maxW - ((maxW - minW) * j) / 4;
      var ly = padT + (gh * j) / 4 + 3;
      ctx.fillText(val.toFixed(1), 4, ly);
    }

    var n = series.length;
    function xAt(i) {
      if (n === 1) return padL + gw / 2;
      return padL + (gw * i) / (n - 1);
    }
    function yAt(weight) {
      return padT + gh * (1 - (weight - minW) / (maxW - minW));
    }

    ctx.strokeStyle = '#3dd68c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach(function (p, i) {
      var x = xAt(i);
      var y = yAt(p.weight);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#3dd68c';
    series.forEach(function (p, i) {
      var x = xAt(i);
      var y = yAt(p.weight);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#6b6b7a';
    ctx.font = '9px system-ui,sans-serif';
    if (n <= 5) {
      series.forEach(function (p, i) {
        var lbl = p.date.slice(5);
        ctx.fillText(lbl, xAt(i) - 14, h - 8);
      });
    } else {
      ctx.fillText(series[0].date.slice(5), padL, h - 8);
      ctx.fillText(series[n - 1].date.slice(5), w - padR - 28, h - 8);
    }
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderSummary() {
    var el = document.getElementById('summary');
    if (!el) return;

    var sessions = gymSessionsThisWeek();
    var muscle = setCountsByMuscleThisWeek();
    var bw = latestBodyweight();
    var prot = todayProteinSummary();

    var muscleBits = SUMMARY_MUSCLES.map(function (m) {
      return m[0].toUpperCase() + m.slice(1) + ': ' + muscle[m];
    }).join(' · ');

    var html = '';
    html += '<div class="summary-card summary-card--wide"><span class="summary-label">This week · gym days</span><span class="summary-value">' + sessions + '</span>';
    html += '<div class="summary-sub">' + esc(muscleBits) + '</div></div>';

    html += '<div class="summary-card"><span class="summary-label">Weight</span><span class="summary-value">' + (bw != null ? esc(String(bw)) + ' kg' : '—') + '</span></div>';
    html += '<div class="summary-card"><span class="summary-label">Today protein</span><span class="summary-value">' + (prot != null ? esc(String(Math.round(prot))) + ' g' : '—') + '</span></div>';

    el.innerHTML = html;
  }

  function renderWorkout() {
    var el = document.getElementById('panel-workout');
    if (!el) return;

    var today = todayStr();
    var todayLogs = state.workoutLogs.filter(function (l) {
      return l.date === today;
    });

    var html = '<div class="card"><h2 class="card-title">Today · ' + esc(today) + '</h2>';
    if (todayLogs.length === 0) {
      html += '<p class="muted">No sets logged yet.</p>';
    } else {
      html += '<ul class="list-plain">';
      todayLogs.forEach(function (l) {
        var ex = getExerciseById(l.exerciseId);
        var name = ex ? ex.name : l.exerciseId;
        html += '<li>' + esc(name) + ' · ' + esc(String(l.weight)) + ' kg × ' + esc(String(l.reps)) + '</li>';
      });
      html += '</ul>';
    }
    html += '<div class="row-actions"><button type="button" class="btn btn-secondary" id="btn-delete-last-set">Delete last set (today)</button></div>';
    html += '</div>';

    var allMuscles = setCountsAllMusclesThisWeek();
    var wkLine = Object.keys(allMuscles)
      .sort()
      .map(function (k) {
        return k + ': ' + allMuscles[k];
      })
      .join(' · ');
    html += '<p class="week-strip"><strong>This week · sets</strong> ' + (wkLine ? esc(wkLine) : '—') + '</p>';

    state.exercises.forEach(function (ex) {
      var last = lastSetForExercise(ex.id);
      var best = bestSetForExercise(ex.id);
      var lastStr = last ? last.weight + ' kg × ' + last.reps + ' (' + last.date + ')' : '—';
      var bestStr = best ? best.weight + ' kg × ' + best.reps : '—';
      html +=
        '<button type="button" class="exercise-row" data-exercise-id="' +
        esc(ex.id) +
        '"><div class="exercise-name">' +
        esc(ex.name) +
        '</div><div class="exercise-meta">Last: ' +
        esc(lastStr) +
        '<br/>Best: ' +
        esc(bestStr) +
        '</div></button>';
    });

    el.innerHTML = html;

    el.querySelectorAll('.exercise-row').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openExerciseDetail(btn.getAttribute('data-exercise-id'));
      });
    });

    var delBtn = document.getElementById('btn-delete-last-set');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        deleteLastSetToday();
      });
    }
  }

  function renderFood() {
    var el = document.getElementById('panel-food');
    if (!el) return;
    var t = todayStr();
    var totals = getTodayFoodTotals();
    var html = '';
    html +=
      '<div class="food-totals"><strong>Today</strong> · P ' +
      Math.round(totals.protein) +
      ' · C ' +
      Math.round(totals.carbs) +
      ' · F ' +
      Math.round(totals.fat) +
      ' · ' +
      Math.round(totals.calories) +
      ' kcal</div>';

    state.meals.forEach(function (m) {
      var log = state.foodLogs.find(function (f) {
        return f.date === t && f.mealId === m.id;
      });
      var meta = log
        ? 'P ' + log.protein + ' · C ' + log.carbs + ' · F ' + log.fat + ' · ' + log.calories + ' kcal'
        : 'Tap to log';
      html +=
        '<button type="button" class="meal-row" data-meal-id="' +
        esc(m.id) +
        '"><div class="meal-name">' +
        esc(m.name) +
        '</div><div class="meal-meta">' +
        esc(meta) +
        '</div></button>';
    });

    el.innerHTML = html;
    el.querySelectorAll('.meal-row').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openFoodSheet(btn.getAttribute('data-meal-id'));
      });
    });
  }

  function renderBody() {
    var el = document.getElementById('panel-body');
    if (!el) return;
    var t = todayStr();
    var today = bodyLogForDate(t) || {};

    var html = '<div class="card"><h2 class="card-title">Log · ' + esc(t) + '</h2>';
    html += '<label class="field"><span class="field-label">Bodyweight (kg)</span><input class="field-input" id="body-bw" type="text" inputmode="decimal" value="' + esc(today.bodyweight != null ? String(today.bodyweight) : '') + '" /></label>';
    html += '<label class="field"><span class="field-label">Protein (g)</span><input class="field-input" id="body-protein" type="text" inputmode="decimal" value="' + esc(today.protein != null ? String(today.protein) : '') + '" /></label>';
    html += '<label class="field"><span class="field-label">Calories</span><input class="field-input" id="body-cal" type="text" inputmode="decimal" value="' + esc(today.calories != null ? String(today.calories) : '') + '" /></label>';
    html += '<label class="field"><span class="field-label">Water (L, optional)</span><input class="field-input" id="body-water" type="text" inputmode="decimal" value="' + esc(today.water != null ? String(today.water) : '') + '" /></label>';
    html += '<label class="field"><span class="field-label">Notes (optional)</span><input class="field-input" id="body-notes" type="text" value="' + esc(today.notes || '') + '" /></label>';
    html += '<button type="button" class="btn btn-primary" id="btn-body-save" style="width:100%">Save</button></div>';

    html += '<div class="card"><h2 class="card-title">Last 7 entries</h2>';
    var sorted = state.bodyLogs.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date);
    });
    var seven = sorted.slice(0, 7);
    if (!seven.length) html += '<p class="muted">No entries yet.</p>';
    else {
      html += '<ul class="list-plain">';
      seven.forEach(function (b) {
        var note = b.notes ? ' · ' + String(b.notes).slice(0, 40) : '';
        html +=
          '<li><strong>' +
          esc(b.date) +
          '</strong> · ' +
          (b.bodyweight != null ? esc(String(b.bodyweight)) + ' kg' : '—') +
          ' · P ' +
          (b.protein != null ? esc(String(b.protein)) : '—') +
          esc(note) +
          '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    el.innerHTML = html;

    var save = document.getElementById('btn-body-save');
    if (save) {
      save.addEventListener('click', saveBodyFromForm);
    }
  }

  function saveBodyFromForm() {
    var bwRaw = document.getElementById('body-bw').value.trim();
    var proteinRaw = document.getElementById('body-protein').value.trim();
    var calRaw = document.getElementById('body-cal').value.trim();
    var waterRaw = document.getElementById('body-water').value.trim();
    var notes = document.getElementById('body-notes').value.trim();

    var bw = parseNum(bwRaw);
    var protein = parseNum(proteinRaw);
    var calories = parseNum(calRaw);
    var water = parseNum(waterRaw);

    var t = todayStr();
    var idx = state.bodyLogs.findIndex(function (b) {
      return b.date === t;
    });
    var row = idx >= 0 ? Object.assign({}, state.bodyLogs[idx]) : { date: t };

    if (bwRaw !== '' && !isNaN(bw)) row.bodyweight = bw;
    else delete row.bodyweight;
    if (proteinRaw !== '' && !isNaN(protein)) row.protein = protein;
    else delete row.protein;
    if (calRaw !== '' && !isNaN(calories)) row.calories = calories;
    else delete row.calories;
    if (waterRaw !== '' && !isNaN(water)) row.water = water;
    else delete row.water;
    if (notes) row.notes = notes;
    else delete row.notes;

    var hasAny =
      row.bodyweight != null ||
      row.protein != null ||
      row.calories != null ||
      row.water != null ||
      row.notes != null;
    if (!hasAny) {
      if (idx >= 0) state.bodyLogs.splice(idx, 1);
      saveState();
      refreshAll();
      return;
    }

    if (idx >= 0) state.bodyLogs[idx] = row;
    else state.bodyLogs.push(row);

    state.bodyLogs.sort(function (a, b) {
      return a.date.localeCompare(b.date);
    });
    saveState();
    refreshAll();
  }

  function deleteLastSetToday() {
    var t = todayStr();
    var idx = -1;
    for (var i = state.workoutLogs.length - 1; i >= 0; i--) {
      if (state.workoutLogs[i].date === t) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    state.workoutLogs.splice(idx, 1);
    saveState();
    refreshAll();
  }

  function logSet(exerciseId, weight, reps) {
    state.workoutLogs.push({
      id: newId(),
      date: todayStr(),
      exerciseId: exerciseId,
      weight: weight,
      reps: reps
    });
    saveState();
    refreshAll();
  }

  function showBackdrop(show) {
    var b = document.getElementById('backdrop');
    if (!b) return;
    if (show) b.classList.remove('hidden');
    else b.classList.add('hidden');
    b.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function hideAllSheets() {
    document.querySelectorAll('.sheet').forEach(function (s) {
      s.classList.add('hidden');
    });
    showBackdrop(false);
    sheetLogExerciseId = null;
    sheetDetailExerciseId = null;
    sheetFoodMealId = null;
  }

  function openLogSetSheet(exerciseId) {
    sheetLogExerciseId = exerciseId;
    var ex = getExerciseById(exerciseId);
    var title = document.getElementById('sheet-log-set-title');
    if (title) title.textContent = ex ? 'Log · ' + ex.name : 'Log set';
    document.getElementById('input-weight').value = '';
    document.getElementById('input-reps').value = '';
    document.getElementById('sheet-log-set').classList.remove('hidden');
    showBackdrop(true);
    document.getElementById('input-weight').focus();
  }

  function openExerciseDetail(exerciseId) {
    sheetDetailExerciseId = exerciseId;
    var ex = getExerciseById(exerciseId);
    var title = document.getElementById('sheet-exercise-title');
    if (title) title.textContent = ex ? ex.name : 'Exercise';

    var last = lastSetForExercise(exerciseId);
    var best = bestSetForExercise(exerciseId);
    var lastStr = last ? last.weight + ' kg × ' + last.reps + ' · ' + last.date : '—';
    var bestStr = best ? best.weight + ' kg × ' + best.reps : '—';
    var b30 = bestWeightInRange(exerciseId, '30');
    var headline = b30 != null ? 'Best weight (30d): ' + b30 + ' kg' : 'Best weight (30d): —';

    var stats = document.getElementById('sheet-exercise-stats');
    if (stats) {
      stats.innerHTML =
        '<div><strong>Last</strong> · ' +
        esc(lastStr) +
        '</div><div><strong>Best</strong> · ' +
        esc(bestStr) +
        '</div><div>' +
        esc(headline) +
        '</div>';
    }

    chartRange = '30';
    document.querySelectorAll('#sheet-exercise .chip').forEach(function (c) {
      c.classList.toggle('chip-active', c.getAttribute('data-range') === '30');
    });

    document.getElementById('sheet-exercise').classList.remove('hidden');
    showBackdrop(true);

    requestAnimationFrame(function () {
      var canvas = document.getElementById('exercise-chart');
      if (canvas) drawExerciseChart(canvas, exerciseId, chartRange);
    });
  }

  function openFoodSheet(mealId) {
    sheetFoodMealId = mealId;
    var meal = state.meals.find(function (m) {
      return m.id === mealId;
    });
    var title = document.getElementById('sheet-food-title');
    if (title) title.textContent = meal ? meal.name : 'Meal';
    var t = todayStr();
    var existing = state.foodLogs.find(function (f) {
      return f.date === t && f.mealId === mealId;
    });
    document.getElementById('input-food-p').value = existing && existing.protein != null ? String(existing.protein) : '';
    document.getElementById('input-food-c').value = existing && existing.carbs != null ? String(existing.carbs) : '';
    document.getElementById('input-food-f').value = existing && existing.fat != null ? String(existing.fat) : '';
    document.getElementById('input-food-kcal').value = existing && existing.calories != null ? String(existing.calories) : '';
    updateKcalHint();
    document.getElementById('sheet-food').classList.remove('hidden');
    showBackdrop(true);
    document.getElementById('input-food-p').focus();
  }

  function updateKcalHint() {
    var p = parseNum(document.getElementById('input-food-p').value);
    var c = parseNum(document.getElementById('input-food-c').value);
    var f = parseNum(document.getElementById('input-food-f').value);
    var el = document.getElementById('kcal-hint');
    if (!el) return;
    if (!isNaN(p) && !isNaN(c) && !isNaN(f)) {
      var est = 4 * p + 4 * c + 9 * f;
      el.textContent = '~ from macros: ' + Math.round(est) + ' kcal (4P+4C+9F)';
    } else el.textContent = '';
  }

  function saveFoodFromSheet() {
    var p = parseNum(document.getElementById('input-food-p').value);
    var c = parseNum(document.getElementById('input-food-c').value);
    var f = parseNum(document.getElementById('input-food-f').value);
    var k = parseNum(document.getElementById('input-food-kcal').value);
    if ([p, c, f, k].every(function (x) {
      return isNaN(x);
    })) {
      alert('Enter at least one value.');
      return;
    }
    var t = todayStr();
    var mealId = sheetFoodMealId;
    var idx = state.foodLogs.findIndex(function (x) {
      return x.date === t && x.mealId === mealId;
    });
    var row = {
      id: idx >= 0 ? state.foodLogs[idx].id : newId(),
      date: t,
      mealId: mealId,
      protein: isNaN(p) ? 0 : p,
      carbs: isNaN(c) ? 0 : c,
      fat: isNaN(f) ? 0 : f,
      calories: isNaN(k) ? 0 : k
    };
    if (idx >= 0) state.foodLogs[idx] = row;
    else state.foodLogs.push(row);
    saveState();
    hideAllSheets();
    refreshAll();
  }

  function submitLogSet() {
    var w = parseNum(document.getElementById('input-weight').value);
    var r = parseNum(document.getElementById('input-reps').value);
    if (isNaN(w) || isNaN(r) || r <= 0 || w < 0) {
      alert('Enter valid weight and reps.');
      return;
    }
    logSet(sheetLogExerciseId, w, Math.round(r));
    hideAllSheets();
  }

  function refreshAll() {
    document.getElementById('today-label').textContent = 'Today · ' + todayStr();
    renderSummary();
    if (activeTab === 'workout') renderWorkout();
    else if (activeTab === 'food') renderFood();
    else renderBody();
    if (sheetDetailExerciseId) {
      var canvas = document.getElementById('exercise-chart');
      if (canvas && !document.getElementById('sheet-exercise').classList.contains('hidden')) {
        drawExerciseChart(canvas, sheetDetailExerciseId, chartRange);
        var ex = getExerciseById(sheetDetailExerciseId);
        var b30 = bestWeightInRange(sheetDetailExerciseId, '30');
        var headline = b30 != null ? 'Best weight (30d): ' + b30 + ' kg' : 'Best weight (30d): —';
        var stats = document.getElementById('sheet-exercise-stats');
        if (stats && ex) {
          var last = lastSetForExercise(sheetDetailExerciseId);
          var best = bestSetForExercise(sheetDetailExerciseId);
          var lastStr = last ? last.weight + ' kg × ' + last.reps + ' · ' + last.date : '—';
          var bestStr = best ? best.weight + ' kg × ' + best.reps : '—';
          stats.innerHTML =
            '<div><strong>Last</strong> · ' +
            esc(lastStr) +
            '</div><div><strong>Best</strong> · ' +
            esc(bestStr) +
            '</div><div>' +
            esc(headline) +
            '</div>';
        }
      }
    }
  }

  function setTab(name) {
    activeTab = name;
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('hidden', p.getAttribute('data-panel') !== name);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    refreshAll();
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'no-bs-tracker-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!isValidImportedRoot(parsed)) throw new Error('Invalid JSON');
        var next = migrate(parsed);
        state = next;
        saveState();
        hideAllSheets();
        refreshAll();
      } catch (e) {
        alert('Import failed: invalid file.');
      }
    };
    reader.readAsText(file);
  }

  function resetApp() {
    if (!confirm('Delete all local data? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = createEmptyState();
    saveState();
    hideAllSheets();
    refreshAll();
  }

  function seedSample() {
    var t = todayStr();
    var wr = weekRangeContaining(t);
    var sample = createEmptyState();
    sample.workoutLogs = [
      { id: newId(), date: wr.start, exerciseId: 'seated-chest-press', weight: 35, reps: 10 },
      { id: newId(), date: wr.start, exerciseId: 'seated-chest-press', weight: 40, reps: 8 },
      { id: newId(), date: t, exerciseId: 'lat-pulldown', weight: 45, reps: 12 }
    ];
    sample.bodyLogs = [
      {
        date: t,
        bodyweight: 72,
        protein: 120,
        calories: 2000,
        water: 2,
        notes: 'Sample'
      }
    ];
    sample.foodLogs = [
      { id: newId(), date: t, mealId: 'breakfast', protein: 30, carbs: 40, fat: 10, calories: 350 },
      { id: newId(), date: t, mealId: 'lunch', protein: 40, carbs: 50, fat: 15, calories: 500 }
    ];
    state = sample;
    saveState();
    hideAllSheets();
    refreshAll();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js').catch(function () {});
    });
  }

  function bind() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setTab(tab.getAttribute('data-tab'));
      });
    });

    document.getElementById('backdrop').addEventListener('click', hideAllSheets);

    document.getElementById('btn-log-set-save').addEventListener('click', submitLogSet);
    document.getElementById('btn-log-set-cancel').addEventListener('click', hideAllSheets);

    document.getElementById('btn-exercise-close').addEventListener('click', hideAllSheets);
    document.getElementById('btn-exercise-log-set').addEventListener('click', function () {
      var id = sheetDetailExerciseId;
      hideAllSheets();
      if (id) openLogSetSheet(id);
    });

    document.querySelectorAll('#sheet-exercise .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        chartRange = chip.getAttribute('data-range');
        document.querySelectorAll('#sheet-exercise .chip').forEach(function (c) {
          c.classList.toggle('chip-active', c === chip);
        });
        if (sheetDetailExerciseId) {
          var canvas = document.getElementById('exercise-chart');
          if (canvas) drawExerciseChart(canvas, sheetDetailExerciseId, chartRange);
          var bw = bestWeightInRange(sheetDetailExerciseId, chartRange);
          var label =
            chartRange === 'all'
              ? 'Best weight (all): '
              : 'Best weight (' + chartRange + 'd): ';
          var headline = bw != null ? label + bw + ' kg' : label + '—';
          var stats = document.getElementById('sheet-exercise-stats');
          if (stats && sheetDetailExerciseId) {
            var last = lastSetForExercise(sheetDetailExerciseId);
            var best = bestSetForExercise(sheetDetailExerciseId);
            var lastStr = last ? last.weight + ' kg × ' + last.reps + ' · ' + last.date : '—';
            var bestStr = best ? best.weight + ' kg × ' + best.reps : '—';
            stats.innerHTML =
              '<div><strong>Last</strong> · ' +
              esc(lastStr) +
              '</div><div><strong>Best</strong> · ' +
              esc(bestStr) +
              '</div><div>' +
              esc(headline) +
              '</div>';
          }
        }
      });
    });

    document.getElementById('btn-food-save').addEventListener('click', saveFoodFromSheet);
    document.getElementById('btn-food-cancel').addEventListener('click', hideAllSheets);
    ['input-food-p', 'input-food-c', 'input-food-f'].forEach(function (id) {
      var inp = document.getElementById(id);
      if (inp) inp.addEventListener('input', updateKcalHint);
    });

    document.getElementById('btn-export').addEventListener('click', exportJson);
    document.getElementById('btn-import').addEventListener('click', function () {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importJson(f);
      e.target.value = '';
    });
    document.getElementById('btn-reset').addEventListener('click', resetApp);
    document.getElementById('btn-seed').addEventListener('click', seedSample);

    window.addEventListener('resize', function () {
      if (sheetDetailExerciseId) {
        var canvas = document.getElementById('exercise-chart');
        if (canvas && !document.getElementById('sheet-exercise').classList.contains('hidden')) {
          drawExerciseChart(canvas, sheetDetailExerciseId, chartRange);
        }
      }
    });
  }

  loadState();
  bind();
  registerSW();
  setTab('workout');
})();
