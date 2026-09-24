/**
 * Lightweight charts: plain HTML/CSS, no library (0 kB added). Every chart is
 * readable without the graphic — values are text, and the day chart has a
 * screen-reader table — so they work on low-end phones and with assistive tech.
 */

/** Horizontal bars with the value as text. `format(value, item)` (items may carry a currency). */
export function BarList({ items, label, format = (v) => String(v), max }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <figure className="nv-barlist" aria-label={label}>
      {label && <figcaption className="nv-section-header__title" style={{ marginBottom: 10 }}>{label}</figcaption>}
      <ul>
        {items.map((i) => (
          <li key={i.label}>
            <div className="nv-barlist__row">
              <span className="nv-barlist__label">{i.label}</span>
              <span className="nv-barlist__value nv-num">{format(i.value, i)}{i.note && <small> · {i.note}</small>}</span>
            </div>
            <div className="nv-barlist__track" aria-hidden="true"><i style={{ width: `${Math.max(2, (i.value / top) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Daily totals as columns, with the previous period's average as a reference line. */
export function DayBars({ days, label, format = (v) => String(v), reference }) {
  const top = Math.max(1, ...days.map((d) => d.value), reference ?? 0);
  const peak = Math.max(0, ...days.map((d) => d.value));
  return (
    <figure className="nv-daybars" aria-label={label}>
      {/* The card header names the chart; the caption is for screen readers only. */}
      {label && <figcaption className="nv-visually-hidden">{label}</figcaption>}
      <div className="nv-daybars__scale" aria-hidden="true"><span>{format(top)}</span><span>{peak > 0 ? `peak ${format(peak)}` : "no sales in this period"}</span></div>
      <div className="nv-daybars__plot" aria-hidden="true">
        <u className="nv-daybars__mid" />
        {reference ? <b style={{ bottom: `${(reference / top) * 100}%` }} title="Previous period’s daily average" /> : null}
        {days.map((d) => (
          <i key={d.day} className={d.value === peak && peak > 0 ? "is-peak" : undefined} style={{ height: `${Math.max(d.value > 0 ? 3 : 0, (d.value / top) * 100)}%` }} title={`${d.day}: ${format(d.value)}`} />
        ))}
      </div>
      <div className="nv-daybars__axis" aria-hidden="true"><span>{days[0]?.day}</span><span>{days[days.length - 1]?.day}</span></div>
      <table className="nv-visually-hidden">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Amount</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.day}><td>{d.day}</td><td>{format(d.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Builds a CSV and hands it to the browser as a download (generated on the device). */
export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
