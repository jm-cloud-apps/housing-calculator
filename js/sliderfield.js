// Wires a <input type="range"> and its paired <input type="number"> together so dragging
// one updates the other, clamps to [min,max], and calls onChange(value) on every update.
// Expects HTML like:
//   <input type="range" id="${id}-slider" ...>
//   <input type="number" id="${id}-value" ...>
export function bindSliderField(id, { min, max, step, value, onChange }) {
  const slider = document.getElementById(`${id}-slider`);
  const number = document.getElementById(`${id}-value`);

  const clamp = (v) => (Number.isNaN(v) ? current : Math.min(max, Math.max(min, v)));
  const formatForStep = (v) => {
    const decimals = (String(step).split(".")[1] || "").length;
    return Number(v.toFixed(decimals));
  };

  let current = clamp(Number(value));

  function applyToDom(v) {
    slider.value = v;
    number.value = formatForStep(v);
  }

  function set(v) {
    current = clamp(Number(v));
    applyToDom(current);
    onChange(current);
    return current;
  }

  slider.addEventListener("input", () => {
    current = Number(slider.value);
    number.value = formatForStep(current);
    onChange(current);
  });

  // Don't rewrite the number box while the user is actively typing (avoids clobbering
  // "1" while they're still typing "12.5"). Only reformat it on blur/change; the slider
  // still tracks live so the two stay visually in sync as they type.
  number.addEventListener("input", () => {
    const raw = Number(number.value);
    if (Number.isNaN(raw)) return;
    current = clamp(raw);
    slider.value = current;
    onChange(current);
  });

  number.addEventListener("blur", () => applyToDom(current));
  number.addEventListener("change", () => applyToDom(current));

  applyToDom(current);

  return { get: () => current, set };
}
