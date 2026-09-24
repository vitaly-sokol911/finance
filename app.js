"use strict";

// ===================== Справочники =====================
const CATEGORIES = {
  expense: [
    { id: "food", name: "Продукты", emoji: "🛒", color: "#ff8a5b" },
    { id: "cafe", name: "Кафе и рестораны", emoji: "🍽️", color: "#ffc857" },
    { id: "transport", name: "Транспорт", emoji: "🚌", color: "#4cc9f0" },
    { id: "home", name: "Жильё и ЖКХ", emoji: "🏠", color: "#f06292" },
    { id: "fun", name: "Развлечения", emoji: "🎮", color: "#2ec4b6" },
    { id: "health", name: "Здоровье", emoji: "💊", color: "#a3e635" },
    { id: "shopping", name: "Покупки", emoji: "🛍️", color: "#e879f9" },
    { id: "other_exp", name: "Прочее", emoji: "📦", color: "#8b8b95" },
  ],
  income: [
    { id: "salary", name: "Зарплата", emoji: "💼", color: "#3ddc97" },
    { id: "freelance", name: "Подработка", emoji: "💻", color: "#4cc9f0" },
    { id: "gift", name: "Подарок", emoji: "🎁", color: "#ffc857" },
    { id: "other_inc", name: "Прочее", emoji: "✨", color: "#a3e635" },
  ],
};
const FALLBACK_CAT = { expense: "other_exp", income: "other_inc" };
const CURRENCIES = ["RUB", "USD", "EUR"];
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const LIMITS = { note: 60, amount: 1e11, importBytes: 1_000_000, importRows: 5000 };
const KEYS = { tx: "finance.tx.v2", budgets: "finance.budgets.v2", settings: "finance.settings.v2" };

// ===================== Проверка данных =====================
// Всё, что приходит из localStorage или CSV, считаем недоверенным и пропускаем через эти функции.
const findCat = (type, id) => CATEGORIES[type].find((c) => c.id === id);
const catInfo = (type, id) => findCat(type, id) || findCat(type, FALLBACK_CAT[type]);

function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return y >= 1970 && y <= 2100 && dt.getMonth() === m - 1 && dt.getDate() === d;
}

let idSeq = 0;
function cleanTx(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type === "income" || raw.type === "expense" ? raw.type : null;
  const amount = Number(raw.amount);
  if (!type || !(amount > 0 && amount <= LIMITS.amount) || !isValidDate(raw.date)) return null;
  return {
    id: ++idSeq,
    type,
    amount: Math.round(amount * 100) / 100,
    category: findCat(type, raw.category) ? raw.category : FALLBACK_CAT[type],
    date: raw.date,
    note: typeof raw.note === "string" ? raw.note.trim().slice(0, LIMITS.note) : "",
  };
}

function cleanBudgets(raw) {
  const out = {};
  for (const c of CATEGORIES.expense) {
    const v = Number(raw?.[c.id]);
    if (v > 0 && v <= LIMITS.amount) out[c.id] = v;
  }
  return out;
}

// ===================== Хранилище =====================
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { toast("Не удалось сохранить: память браузера недоступна или переполнена."); }
}

const rawTx = load(KEYS.tx);
const rawSettings = load(KEYS.settings) || {};
let transactions = (Array.isArray(rawTx) ? rawTx : []).map(cleanTx).filter(Boolean);
let budgets = cleanBudgets(load(KEYS.budgets));
const settings = {
  theme: rawSettings.theme === "light" || rawSettings.theme === "dark"
    ? rawSettings.theme
    : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  currency: CURRENCIES.includes(rawSettings.currency) ? rawSettings.currency : "RUB",
  seeded: rawSettings.seeded === true || transactions.length > 0,
};

const saveTx = () => save(KEYS.tx, transactions);
const saveBudgets = () => save(KEYS.budgets, budgets);
const saveSettings = () => save(KEYS.settings, settings);

// ===================== Утилиты =====================
const el = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");
const monthKeyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const dateStrOf = (d) => `${monthKeyOf(d)}-${pad2(d.getDate())}`;
const monthKey = (dateStr) => dateStr.slice(0, 7);
const monthName = (key) => MONTHS[Number(key.slice(5, 7)) - 1];
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

function formatDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

let formatter;
function fmt(n) {
  formatter ||= new Intl.NumberFormat("ru-RU", { style: "currency", currency: settings.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return formatter.format(Math.round(n)).replace("-", "−");
}

// Создание элементов без innerHTML: текст всегда вставляется как текст, а не как разметка
function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}
function s(tag, attrs, ...children) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}
const b = (text) => h("b", null, text);

// ===================== Уведомления =====================
let toastTimer;
function toast(message, action) {
  const box = el("toast");
  box.replaceChildren(h("span", null, message));
  if (action) {
    box.append(h("button", { type: "button", class: "toast__btn", onclick: () => { hideToast(); action.run(); } }, action.label));
  }
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 8000 : 4000);
}
function hideToast() { el("toast").hidden = true; }

// ===================== Состояние и период =====================
const state = { scope: "month", month: monthKeyOf(new Date()), search: "", flashId: 0 };
const budgetMonth = () => (state.scope === "all" ? monthKeyOf(new Date()) : state.month);
const inPeriod = (t) => state.scope === "all" || monthKey(t.date) === state.month;
const periodPhrase = () => (state.scope === "all" ? "всё время" : monthName(state.month));

function setScope(scope) { state.scope = scope; render(); }
function shiftMonth(delta) {
  const [y, m] = state.month.split("-").map(Number);
  state.month = monthKeyOf(new Date(y, m - 1 + delta, 1));
  state.scope = "month";
  render();
}
el("prevMonth").addEventListener("click", () => shiftMonth(-1));
el("nextMonth").addEventListener("click", () => shiftMonth(1));
el("scopeMonth").addEventListener("click", () => setScope("month"));
el("scopeAll").addEventListener("click", () => setScope("all"));

// ===================== Тема и валюта =====================
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  document.querySelector('meta[name="theme-color"]').content = settings.theme === "dark" ? "#0a0a0c" : "#f6f6f3";
  el("themeBtn").setAttribute("aria-label", settings.theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
}
el("themeBtn").addEventListener("click", () => {
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  saveSettings();
  applyTheme();
});
el("currency").addEventListener("change", (e) => {
  if (!CURRENCIES.includes(e.target.value)) return;
  settings.currency = e.target.value;
  formatter = null;
  saveSettings();
  render();
});

// ===================== Добавление операции =====================
const form = el("txForm");
const currentType = () => form.elements.type.value;

function fillCategories() {
  const type = currentType();
  el("category").replaceChildren(...CATEGORIES[type].map((c) => h("option", { value: c.id }, `${c.emoji}  ${c.name}`)));
  el("submitBtn").textContent = type === "income" ? "Добавить доход" : "Добавить расход";
}
form.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener("change", fillCategories));

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const tx = cleanTx({
    type: currentType(),
    amount: el("amount").value,
    category: el("category").value,
    date: el("date").value,
    note: el("note").value,
  });
  if (!tx) { toast("Проверьте сумму и дату."); return; }
  transactions.push(tx);
  saveTx();
  el("amount").value = "";
  el("note").value = "";
  state.scope = "month";
  state.month = monthKey(tx.date);
  state.flashId = tx.id;
  render();
  el("amount").focus();
});

function removeTx(tx) {
  transactions = transactions.filter((t) => t !== tx);
  saveTx();
  render();
  toast("Операция удалена", { label: "Вернуть", run: () => { transactions.push(tx); saveTx(); render(); } });
}

el("clearAll").addEventListener("click", () => {
  if (!transactions.length) return;
  const backup = transactions;
  transactions = [];
  saveTx();
  render();
  toast("Все операции удалены", { label: "Вернуть", run: () => { transactions = backup; saveTx(); render(); } });
});
el("search").addEventListener("input", (e) => { state.search = e.target.value.toLowerCase().trim(); renderList(); });

// ===================== Стартовые данные =====================
// Первый запуск показывает заполненный учёт за последние месяцы, чтобы графики и выводы были видны сразу
function seedStarter() {
  const today = new Date();
  const mk = ([daysAgo, type, category, amount, note]) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return cleanTx({ type, category, amount, note, date: dateStrOf(d) });
  };
  transactions = [
    [0, "expense", "cafe", 850, "Обед с коллегами"],
    [1, "expense", "food", 3200, "Продукты на неделю"],
    [2, "expense", "transport", 1500, "Проездной"],
    [3, "income", "freelance", 18000, "Лендинг для клиента"],
    [4, "expense", "fun", 2400, "Кино"],
    [6, "expense", "home", 32000, "Аренда"],
    [7, "income", "salary", 95000, "Зарплата"],
    [9, "expense", "health", 1900, "Аптека"],
    [11, "expense", "food", 4100, ""],
    [18, "expense", "shopping", 5600, "Кроссовки"],
    [27, "expense", "cafe", 2300, "День рождения друга"],
    [33, "expense", "home", 32000, "Аренда"],
    [34, "income", "salary", 95000, "Зарплата"],
    [36, "expense", "food", 9800, ""],
    [40, "expense", "fun", 4200, "Концерт"],
    [45, "expense", "transport", 1500, "Проездной"],
    [52, "expense", "shopping", 12400, "Куртка"],
    [63, "expense", "home", 32000, "Аренда"],
    [64, "income", "salary", 92000, "Зарплата"],
    [66, "expense", "food", 11200, ""],
    [70, "income", "gift", 5000, "От бабушки"],
    [75, "expense", "cafe", 4600, ""],
  ].map(mk);
  budgets = { food: 15000, cafe: 6000, fun: 5000 };
  settings.seeded = true;
  saveTx(); saveBudgets(); saveSettings();
}

// ===================== Экспорт / импорт CSV =====================
function csvCell(v) {
  let str = String(v ?? "");
  // Защита от CSV-инъекций: Excel не должен принять текст за формулу
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(str)) str = "'" + str;
  return /[",;\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

el("exportBtn").addEventListener("click", () => {
  if (!transactions.length) { toast("Пока нечего скачивать — добавьте операции."); return; }
  const rows = [["date", "type", "category", "amount", "note"]];
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([t.date, t.type, t.category, t.amount, t.note]);
  }
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  h("a", { href: url, download: `finance-${dateStrOf(new Date())}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Скачано: ${transactions.length} ${plural(transactions.length, "операция", "операции", "операций")}`);
});

el("importBtn").addEventListener("click", () => el("importFile").click());
el("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > LIMITS.importBytes) { toast("Файл больше 1 МБ — это не похоже на выгрузку из приложения."); return; }
  importCSV(await file.text());
});

function parseCSVLine(line, sep) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function importCSV(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) { toast("Файл пустой."); return; }
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const start = /date/i.test(lines[0]) ? 1 : 0;
  const rows = lines.slice(start, start + LIMITS.importRows);
  const added = [];
  for (const line of rows) {
    const [date, type, category, amount, note = ""] = parseCSVLine(line, sep).map((c) => c.trim());
    const tx = cleanTx({ date, type, category, amount: amount?.replace(",", "."), note: note.replace(/^'(?=[=+\-@])/, "") });
    if (tx) added.push(tx);
  }
  const skipped = rows.length - added.length;
  if (!added.length) { toast("Подходящих строк не нашлось. Нужен CSV, скачанный из этого приложения."); return; }
  transactions.push(...added);
  saveTx();
  state.scope = "all";
  render();
  toast(`Загружено: ${added.length} ${plural(added.length, "операция", "операции", "операций")}` + (skipped ? `, пропущено строк с ошибками: ${skipped}` : ""));
}

// ===================== Отрисовка =====================
const counters = new WeakMap();
function countTo(node, to) {
  const prev = counters.get(node) || { value: 0, raf: 0 };
  cancelAnimationFrame(prev.raf);
  const entry = { value: to, raf: 0 };
  counters.set(node, entry);
  if (reduceMotion.matches || document.hidden || prev.value === to) { node.textContent = fmt(to); return; }
  const from = prev.value, t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 600);
    node.textContent = fmt(from + (to - from) * (1 - (1 - p) ** 3));
    if (p < 1) entry.raf = requestAnimationFrame(step);
  };
  entry.raf = requestAnimationFrame(step);
  // Если кадры не рисуются (вкладка в фоне), показать итог; более новая анимация этого не перебьёт
  setTimeout(() => {
    if (counters.get(node) !== entry) return;
    cancelAnimationFrame(entry.raf);
    node.textContent = fmt(to);
  }, 700);
}

const sumBy = (list, type) => list.reduce((acc, t) => (t.type === type ? acc + t.amount : acc), 0);
function expenseByCategory(list) {
  const map = new Map();
  for (const t of list) if (t.type === "expense") map.set(t.category, (map.get(t.category) || 0) + t.amount);
  return [...map].sort((a, b) => b[1] - a[1]);
}
const countOps = (n) => (n ? `${n} ${plural(n, "операция", "операции", "операций")}` : "нет операций");

function render() {
  const isMonth = state.scope === "month";
  el("periodLabel").textContent = isMonth ? `${capitalize(monthName(state.month))} ${state.month.slice(0, 4)}` : "Всё время";
  el("prevMonth").disabled = !isMonth;
  el("nextMonth").disabled = !isMonth || state.month >= monthKeyOf(new Date());
  el("scopeMonth").setAttribute("aria-pressed", String(isMonth));
  el("scopeAll").setAttribute("aria-pressed", String(!isMonth));
  el("currency").value = settings.currency;

  const scoped = transactions.filter(inPeriod);
  const income = sumBy(scoped, "income");
  const expense = sumBy(scoped, "expense");
  const byCat = expenseByCategory(scoped);

  renderHero(income, expense, byCat);
  countTo(el("totalIncome"), income);
  countTo(el("totalExpense"), expense);
  el("incomeSub").textContent = countOps(scoped.filter((t) => t.type === "income").length);
  el("expenseSub").textContent = countOps(scoped.filter((t) => t.type === "expense").length);

  renderList();
  renderDonut(byCat, expense);
  renderBudgets();
  renderInsights(scoped, income, expense, byCat);
  renderLine();
  renderBars();
}

// ---- Итог и полоса «куда ушёл доход» ----
function renderHero(income, expense, byCat) {
  const balance = income - expense;
  el("heroLabel").textContent = `Итог за ${periodPhrase()}`;
  el("hero").classList.toggle("hero--neg", balance < 0);
  countTo(el("balance"), balance);

  const note = el("heroNote");
  if (income > 0 && balance >= 0) note.replaceChildren("Отложено ", b(`${Math.round((balance / income) * 100)}%`), " дохода");
  else if (income > 0) note.replaceChildren("Расходы больше доходов на ", b(fmt(-balance)));
  else if (expense > 0) note.replaceChildren("Доходов за период нет — траты идут из накоплений");
  else note.replaceChildren("Добавьте первую операцию — здесь появится итог");

  const whole = Math.max(income, expense);
  const segs = byCat.map(([id, sum]) => {
    const c = catInfo("expense", id);
    return h("span", { class: "strip__seg", title: `${c.name}: ${fmt(sum)}`, style: { flexGrow: sum / whole, background: c.color } });
  });
  if (balance > 0) segs.push(h("span", { class: "strip__seg strip__seg--saved", title: `Осталось: ${fmt(balance)}`, style: { flexGrow: balance / whole } }));
  el("strip").replaceChildren(...segs);
  el("strip").setAttribute("aria-label", whole
    ? `Из дохода ${fmt(income)} потрачено ${fmt(expense)}${balance > 0 ? `, осталось ${fmt(balance)}` : ""}`
    : "Операций за период нет");
}

// ---- История ----
function renderList() {
  const query = state.search;
  const items = transactions
    .filter(inPeriod)
    .filter((t) => !query || `${catInfo(t.type, t.category).name} ${t.note}`.toLowerCase().includes(query))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  el("txList").replaceChildren(...items.map((t) => {
    const c = catInfo(t.type, t.category);
    const sign = t.type === "income" ? "+" : "−";
    return h("li", { class: t.id === state.flashId ? "tx tx--new" : "tx" },
      h("span", { class: "tx__icon", style: { background: c.color + "26" }, "aria-hidden": "true" }, c.emoji),
      h("span", { class: "tx__main" },
        h("span", { class: "tx__cat" }, c.name),
        h("span", { class: "tx__meta" }, formatDate(t.date) + (t.note ? ` · ${t.note}` : ""))),
      h("span", { class: `tx__amount tx__amount--${t.type}` }, sign + fmt(t.amount)),
      h("button", { type: "button", class: "tx__del", "aria-label": `Удалить: ${c.name}, ${fmt(t.amount)}`, onclick: () => removeTx(t) }, "×"));
  }));
  state.flashId = 0;

  const hint = el("emptyHint");
  hint.hidden = items.length > 0;
  hint.textContent = query
    ? "Ничего не нашлось. Попробуйте другое слово."
    : "Операций за этот период нет. Добавьте первую в форме выше.";
}

// ---- Пончик по категориям ----
function renderDonut(byCat, total) {
  const empty = byCat.length === 0;
  el("donutBox").hidden = empty;
  el("donutEmpty").hidden = !empty;
  if (empty) return;

  let acc = 0;
  const stops = [];
  const items = byCat.map(([id, sum]) => {
    const c = catInfo("expense", id);
    const pct = (sum / total) * 100;
    stops.push(`${c.color} ${acc}% ${acc + pct}%`);
    acc += pct;
    return h("li", null,
      h("span", { class: "legend__swatch", style: { background: c.color } }),
      `${c.emoji} ${c.name}`,
      h("span", { class: "legend__sum" }, fmt(sum)),
      h("span", { class: "legend__pct" }, `${Math.round(pct)}%`));
  });
  el("legend").replaceChildren(...items);
  el("donut").style.background = `conic-gradient(${stops.join(",")})`;
  el("donutHole").replaceChildren(h("b", null, fmt(total)), h("small", null, "всего расходов"));
}

// ---- Лимиты ----
function renderBudgets() {
  const month = budgetMonth();
  el("budgetTitle").textContent = `Лимиты на ${monthName(month)}`;
  const spent = new Map(expenseByCategory(transactions.filter((t) => monthKey(t.date) === month)));
  const withLimit = CATEGORIES.expense.filter((c) => budgets[c.id]);

  const rows = withLimit.map((c) => {
    const limit = budgets[c.id];
    const used = spent.get(c.id) || 0;
    const ratio = used / limit;
    const level = ratio > 1 ? " budget__fill--over" : ratio >= 0.8 ? " budget__fill--warn" : "";
    return h("div", { class: "budget" },
      h("label", { class: "budget__name", for: `limit-${c.id}` }, `${c.emoji} ${c.name}`),
      h("input", {
        class: "budget__limit", id: `limit-${c.id}`, type: "number", min: "0", max: String(LIMITS.amount), step: "1",
        value: String(limit), title: "Лимит в месяц. Сотрите сумму, чтобы убрать лимит.",
        onchange: (e) => setBudget(c.id, e.target.value),
      }),
      h("div", { class: "budget__bar" }, h("div", { class: "budget__fill" + level, style: { width: `${Math.min(100, ratio * 100)}%` } })),
      h("div", { class: "budget__meta" },
        h("span", null, `${fmt(used)} из ${fmt(limit)}`),
        ratio > 1
          ? h("span", { class: "is-over" }, `превышен на ${fmt(used - limit)}`)
          : h("span", null, `осталось ${fmt(limit - used)}`)));
  });
  el("budgets").replaceChildren(...(rows.length
    ? rows
    : [h("p", { class: "empty" }, "Задайте месячный лимит на категорию — и увидите, сколько ещё можно потратить.")]));

  const free = CATEGORIES.expense.filter((c) => !budgets[c.id]);
  el("budgetForm").hidden = free.length === 0;
  el("budgetCat").replaceChildren(...free.map((c) => h("option", { value: c.id }, `${c.emoji}  ${c.name}`)));
}

function setBudget(id, value) {
  if (!findCat("expense", id)) return;
  const v = Number(value);
  if (v > 0 && v <= LIMITS.amount) budgets[id] = Math.round(v);
  else delete budgets[id];
  saveBudgets();
  render();
}
el("budgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  setBudget(el("budgetCat").value, el("budgetAmount").value);
  el("budgetAmount").value = "";
});

// ---- Выводы ----
function renderInsights(scoped, income, expense, byCat) {
  el("insightsTitle").textContent = `Выводы за ${periodPhrase()}`;
  const items = [];
  const add = (parts, alert) => items.push(h("li", { class: alert ? "is-alert" : null }, ...parts));

  if (!scoped.length) add(["Операций за этот период нет. Добавьте первую — и здесь появятся подсказки."]);
  else {
    const balance = income - expense;
    if (income > 0 && balance >= 0) add(["Вы сохранили ", b(fmt(balance)), ` — это ${Math.round((balance / income) * 100)}% дохода.`]);
    else if (income > 0) add(["Расходы превысили доходы на ", b(fmt(-balance)), "."], true);
    else add(["Доходов за период нет — все траты идут из накоплений."], true);

    if (byCat.length) {
      const [id, sum] = byCat[0];
      const c = catInfo("expense", id);
      add(["Больше всего уходит на ", b(`${c.emoji} ${c.name}`), `: ${fmt(sum)}, это ${Math.round((sum / expense) * 100)}% расходов.`]);
    }

    const days = periodDays(scoped);
    if (expense > 0 && days) add(["В среднем вы тратите ", b(fmt(expense / days)), " в день."]);
  }

  const month = budgetMonth();
  const spent = new Map(expenseByCategory(transactions.filter((t) => monthKey(t.date) === month)));
  const names = (pred) => CATEGORIES.expense.filter((c) => budgets[c.id] && pred((spent.get(c.id) || 0) / budgets[c.id])).map((c) => c.name).join(", ");
  const over = names((r) => r > 1);
  const near = names((r) => r >= 0.8 && r <= 1);
  if (over) add([`Лимит на ${monthName(month)} превышен: `, b(over), "."], true);
  if (near) add([`Лимит почти исчерпан: `, b(near), "."]);

  el("insights").replaceChildren(...items);
}

// Сколько дней считать для «среднего в день»
function periodDays(scoped) {
  if (state.scope === "all") {
    const dates = scoped.map((t) => t.date).sort();
    return Math.round((new Date(dates.at(-1)) - new Date(dates[0])) / 86400000) + 1;
  }
  const [y, m] = state.month.split("-").map(Number);
  const now = new Date();
  if (state.month === monthKeyOf(now)) return now.getDate();
  return state.month < monthKeyOf(now) ? new Date(y, m, 0).getDate() : 0;
}

// ---- Линия баланса за всё время ----
function renderLine() {
  const box = el("lineChart");
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const empty = sorted.length < 2;
  box.hidden = empty;
  el("lineEmpty").hidden = !empty;
  if (empty) { box.replaceChildren(); return; }

  let bal = 0;
  const pts = sorted.map((t) => (bal += t.type === "income" ? t.amount : -t.amount));
  const W = 600, H = 170, P = 6;
  const min = Math.min(0, ...pts), max = Math.max(0, ...pts), range = max - min || 1;
  const x = (i) => (P + (i / (pts.length - 1)) * (W - 2 * P)).toFixed(1);
  const y = (v) => (P + (1 - (v - min) / range) * (H - 2 * P)).toFixed(1);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const last = pts.at(-1);
  const color = last >= 0 ? "var(--income)" : "var(--expense)";

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img",
    "aria-label": `Баланс за всё время: ${fmt(last)}` },
    s("defs", null, s("linearGradient", { id: "lcFill", x1: "0", y1: "0", x2: "0", y2: "1" },
      s("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.28" }),
      s("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" }))),
    s("line", { class: "lc-zero", x1: P, x2: W - P, y1: y(0), y2: y(0) }),
    s("path", { d: `${line} L${x(pts.length - 1)},${y(min)} L${x(0)},${y(min)} Z`, fill: "url(#lcFill)" }),
    s("path", { class: "lc-line", d: line, stroke: color }));

  const labels = h("div", { class: "linechart__labels" },
    h("span", null, formatDate(sorted[0].date)),
    h("span", null, `${formatDate(sorted.at(-1).date)} · `, b(fmt(last))));
  box.replaceChildren(svg, labels);
}

// ---- Столбцы по месяцам ----
function renderBars() {
  const byMonth = new Map();
  for (const t of transactions) {
    const k = monthKey(t.date);
    const m = byMonth.get(k) || { income: 0, expense: 0 };
    m[t.type] += t.amount;
    byMonth.set(k, m);
  }
  const keys = [...byMonth.keys()].sort().slice(-6);
  el("bars").hidden = !keys.length;
  el("barsEmpty").hidden = keys.length > 0;

  const max = Math.max(1, ...keys.map((k) => Math.max(byMonth.get(k).income, byMonth.get(k).expense)));
  el("bars").replaceChildren(...keys.map((k) => {
    const { income, expense } = byMonth.get(k);
    const label = `${MONTHS_SHORT[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
    return h("div", { class: "bar-group", role: "img", "aria-label": `${capitalize(monthName(k))} ${k.slice(0, 4)}: доходы ${fmt(income)}, расходы ${fmt(expense)}` },
      h("div", { class: "bar-pair" },
        h("div", { class: "bar bar--income", title: `Доходы: ${fmt(income)}`, style: { height: `${(income / max) * 100}%` } }),
        h("div", { class: "bar bar--expense", title: `Расходы: ${fmt(expense)}`, style: { height: `${(expense / max) * 100}%` } })),
      h("span", { class: "bar-label" }, label));
  }));
}

// ===================== Запуск =====================
if (!settings.seeded) seedStarter();
el("date").value = dateStrOf(new Date());
applyTheme();
fillCategories();
render();
