/* ============================================================
   SIGMA PAY · script.js
   Ванильный JS. Никаких зависимостей. Чистый хаос, упорядоченный
   в регулярные выражения.
   ============================================================ */

// ---------- Утилиты ----------
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const onlyDigits = (s) => s.replace(/\D+/g, "");

// ---------- Ссылки на DOM ----------
const form       = $("#payForm");
const cardPrev   = $("#cardPreview");
const submitBtn  = $("#submitBtn");
const successBox = $("#successBox");
const resetBtn   = $("#resetBtn");

const fields = {
  lastName:    $("#lastName"),
  firstName:   $("#firstName"),
  middleName:  $("#middleName"),
  cardNumber:  $("#cardNumber"),
  ccv:         $("#ccv"),
  expiry:      $("#expiry"),
  email:       $("#email"),
};

const preview = {
  number: $("#pvNumber"),
  name:   $("#pvName"),
  exp:    $("#pvExp"),
  ccv:    $("#pvCcv"),
};

const cardTypeEl = $("#cardType");

// ---------- Маски ввода ----------

// ФИО: только буквы (кир/лат) + дефис + пробел
$$("[data-alpha]").forEach((input) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^\p{L}\p{M}\- '’]/gu, "");
  });
});

// Номер карты: цифры + группировка по 4
fields.cardNumber.addEventListener("input", () => {
  const digits = onlyDigits(fields.cardNumber.value).slice(0, 16);
  fields.cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  detectCardType(digits);
  updatePreview();
  if (fields.cardNumber.dataset.touched) validateField(fields.cardNumber);
});

// CCV: только цифры
fields.ccv.addEventListener("input", () => {
  fields.ccv.value = onlyDigits(fields.ccv.value).slice(0, 4);
  updatePreview();
  if (fields.ccv.dataset.touched) validateField(fields.ccv);
});

// Срок действия: MM/YY с автоподстановкой слэша
fields.expiry.addEventListener("input", () => {
  let d = onlyDigits(fields.expiry.value).slice(0, 4);
  // автоисправление месяца: если ввели 13–19, считаем первую цифру за "1"
  if (d.length >= 2 && +d.slice(0, 2) > 12 && d[0] !== "1") {
    d = "0" + d;
  } else if (d.length >= 2 && +d.slice(0, 2) > 12) {
    d = "1" + d.slice(1);
  }
  let out = d;
  if (d.length > 2) out = d.slice(0, 2) + "/" + d.slice(2);
  else if (d.length === 2) out = d + "/";
  fields.expiry.value = out;
  updatePreview();
  if (fields.expiry.dataset.touched) validateField(fields.expiry);
});

// Email / ФИО — обновляем превью
[fields.lastName, fields.firstName, fields.middleName, fields.email].forEach((i) => {
  i.addEventListener("input", updatePreview);
});

// Показ/скрытие CCV
$("#toggleCcv").addEventListener("click", () => {
  fields.ccv.type = fields.ccv.type === "password" ? "text" : "password";
});

// Клик по карте — flip (смотреть CCV 😏)
cardPrev.addEventListener("click", () => cardPrev.classList.toggle("flipped"));

// Фокус на CCV — автоматически переворачиваем карту
fields.ccv.addEventListener("focus", () => cardPrev.classList.add("flipped"));
fields.ccv.addEventListener("blur",  () => cardPrev.classList.remove("flipped"));

// ---------- Определение платёжной системы ----------
const CARD_PATTERNS = [
  { name: "МИР",        re: /^2[0-2]\d{2}/ },
  { name: "VISA",       re: /^4/ },
  { name: "MC",         re: /^(5[1-5]|2[2-7])/ },
  { name: "AMEX",       re: /^3[47]/ },
  { name: "JCB",        re: /^35(2[89]|[3-8])/ },
  { name: "DISCOVER",   re: /^6(011|5)/ },
];

function detectCardType(digits) {
  const found = CARD_PATTERNS.find((p) => p.re.test(digits));
  if (found) {
    cardTypeEl.textContent = found.name;
    cardTypeEl.classList.add("visible");
  } else {
    cardTypeEl.classList.remove("visible");
    cardTypeEl.textContent = "";
  }
}

// ---------- Превью карты ----------
function updatePreview() {
  const digits = onlyDigits(fields.cardNumber.value);
  const masked = digits.padEnd(16, "•").replace(/(.{4})/g, "$1 ").trim();
  preview.number.textContent = masked;

  const fio = [fields.lastName.value, fields.firstName.value]
    .map((s) => s.trim()).filter(Boolean).join(" ");
  preview.name.textContent = fio ? fio.toUpperCase() : "IVAN DOE";

  preview.exp.textContent = fields.expiry.value || "MM/YY";
  preview.ccv.textContent = fields.ccv.value
    ? fields.ccv.value.replace(/\d/g, "•") : "•••";
}

// ---------- Валидация ----------
const validators = {
  lastName(v) {
    if (!v.trim()) return "Укажи фамилию. Имя при рождении не отменить.";
    if (v.trim().length < 2) return "Минимум 2 символа.";
    return "";
  },
  firstName(v) {
    if (!v.trim()) return "Имя обязательно.";
    if (v.trim().length < 2) return "Минимум 2 символа.";
    return "";
  },
  middleName(v) {
    if (v && v.trim().length < 2) return "Отчество — минимум 2 символа или пусто.";
    return "";
  },
  cardNumber(v) {
    const d = onlyDigits(v);
    if (!d) return "Номер карты пуст.";
    if (d.length < 13 || d.length > 16) return "В номере должно быть 13–16 цифр.";
    if (!luhnCheck(d)) return "Номер не проходит проверку Луна. Фейк?";
    return "";
  },
  ccv(v) {
    const d = onlyDigits(v);
    const need = /^3[47]/.test(onlyDigits(fields.cardNumber.value)) ? 4 : 3;
    if (!d) return "CCV обязателен.";
    if (d.length !== need) return `CCV — ${need} цифры.`;
    return "";
  },
  expiry(v) {
    const m = v.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return "Формат: ММ/ГГ";
    const month = +m[1], year = 2000 + +m[2];
    if (month < 1 || month > 12) return "Месяц 01–12.";
    const now = new Date();
    const lastDay = new Date(year, month, 0, 23, 59, 59);
    if (lastDay < now) return "Просрочено. Как и твоя юность.";
    if (year > now.getFullYear() + 20) return "Слишком далеко в будущем.";
    return "";
  },
  email(v) {
    if (!v.trim()) return "Email нужен для чека.";
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/.test(v.trim())) return "Непохоже на адрес почты.";
    return "";
  },
};

// Алгоритм Луны 🌙
function luhnCheck(digits) {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = +digits[i];
    if (dbl) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function setFieldState(input, msg) {
  const field = input.closest(".field");
  const errEl = $(".err-msg", field);
  field.classList.remove("invalid", "valid");
  if (msg) {
    field.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
  } else if (input.value.trim()) {
    field.classList.add("valid");
    input.removeAttribute("aria-invalid");
  } else {
    input.removeAttribute("aria-invalid");
  }
  errEl.textContent = msg || "";
}

function validateField(input) {
  const fn = validators[input.name];
  if (!fn) return true;
  const msg = fn(input.value);
  setFieldState(input, msg);
  return !msg;
}

// Валидация при потере фокуса + после первого провала — на каждое изменение
Object.values(fields).forEach((input) => {
  input.addEventListener("blur", () => {
    input.dataset.touched = "1";
    validateField(input);
  });
  input.addEventListener("input", () => {
    if (input.dataset.touched) validateField(input);
  });
});

// ---------- Отправка ----------
form.addEventListener("submit", (e) => {
  e.preventDefault();

  let firstBad = null;
  Object.values(fields).forEach((input) => {
    input.dataset.touched = "1";
    const ok = validateField(input);
    if (!ok && !firstBad) firstBad = input;
  });

  const agreeErr = $(".agree-err");
  const agreed = $("#agree").checked;
  agreeErr.classList.toggle("show", !agreed);
  if (!agreed && !firstBad) firstBad = $("#agree");

  if (firstBad) {
    firstBad.focus({ preventScroll: false });
    firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // «Отправка» — имитация запроса
  submitBtn.classList.add("loading");
  $(".btn-text", submitBtn).textContent = "Обработка…";

  setTimeout(() => {
    submitBtn.classList.remove("loading");
    $(".btn-text", submitBtn).textContent = "Оплатить";

    const last4 = onlyDigits(fields.cardNumber.value).slice(-4);
    $("#successText").textContent =
      `Карта •••• ${last4} · чек улетел на ${fields.email.value.trim()}. ` +
      `${fields.firstName.value.trim() || "Друг"}, ты свободен.`;
    successBox.hidden = false;
  }, 1400);
});

// Сброс
resetBtn.addEventListener("click", () => {
  successBox.hidden = true;
  form.reset();
  Object.values(fields).forEach((input) => {
    delete input.dataset.touched;
    const field = input.closest(".field");
    field.classList.remove("invalid", "valid");
    $(".err-msg", field).textContent = "";
  });
  $(".agree-err").classList.remove("show");
  cardTypeEl.classList.remove("visible");
  updatePreview();
});

// Первичное состояние превью
updatePreview();
