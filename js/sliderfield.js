// Wires a <input type="range"> and its paired <input type="number"> together so dragging
// one updates the other, clamps to [min,max], and calls onChange(value) on every update.
// Expects HTML like:
//   <input type="range" id="${id}-slider" ...>
//   <input type="number" id="${id}-value" ...>
export function bindSliderField(id, { min, max, step, value, onChange, formatAria }) {
  const slider = document.getElementById(`${id}-slider`);
  const number = document.getElementById(`${id}-value`);

  // Announce a human-readable value to VoiceOver (e.g. "$500,000") instead of a bare number.
  const syncAria = (v) => {
    if (formatAria) slider.setAttribute("aria-valuetext", formatAria(v));
  };

  const clamp = (v) => (Number.isNaN(v) ? current : Math.min(max, Math.max(min, v)));
  const decimals = (String(step).split(".")[1] || "").length;
  const formatForStep = (v) => {
    const rounded = Number(Number(v).toFixed(decimals));
    return new Intl.NumberFormat("en-CA", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals > 0 ? decimals : 0,
    }).format(rounded);
  };
  const parseNumericValue = (raw) => {
    const cleaned = String(raw ?? "").replace(/,/g, "").trim();
    if (!cleaned) return Number.NaN;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };

  let current = clamp(Number(value));

  function applyToDom(v) {
    slider.value = v;
    number.value = formatForStep(v);
    syncAria(v);
  }

  function set(v) {
    current = clamp(parseNumericValue(v));
    applyToDom(current);
    onChange(current);
    return current;
  }

  slider.addEventListener("input", () => {
    current = Number(slider.value);
    number.value = formatForStep(current);
    syncAria(current);
    onChange(current);
  });

  // Don't rewrite the number box while the user is actively typing (avoids clobbering
  // "1" while they're still typing "12.5"). Only reformat it on blur/change; the slider
  // still tracks live so the two stay visually in sync as they type.
  number.addEventListener("input", () => {
    const raw = parseNumericValue(number.value);
    if (Number.isNaN(raw)) return;
    current = clamp(raw);
    slider.value = current;
    onChange(current);
  });

  number.addEventListener("blur", () => {
    const raw = parseNumericValue(number.value);
    if (Number.isNaN(raw)) {
      applyToDom(current);
      return;
    }
    current = clamp(raw);
    applyToDom(current);
  });
  number.addEventListener("change", () => {
    const raw = parseNumericValue(number.value);
    if (Number.isNaN(raw)) {
      applyToDom(current);
      return;
    }
    current = clamp(raw);
    applyToDom(current);
  });

  applyToDom(current);

  return { get: () => current, set };
}
