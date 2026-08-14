"use client";

import { useState } from "react";

import { axisTicks, axisTop, formatDayLabel, seriesMax, type DayPoint } from "@/lib/metrics";

/**
 * Grouped bars — sent, opened and replied per day.
 *
 * Grouped rather than stacked on purpose: opens and replies are *subsets* of
 * sends, so stacking them would imply a total that never happened.
 *
 * Series colours were validated against both Warmailer surfaces with the dataviz
 * validator (lightness band, chroma floor, CVD separation, normal-vision floor,
 * contrast). The light steps sit under 3:1 on the cream surface, which is legal
 * only with relief — hence the always-present legend and the table view below.
 */

const SERIES = [
  { key: "sent", label: "Sent" },
  { key: "opened", label: "Opened" },
  { key: "replied", label: "Replied" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

export function ActivityChart({ points }: { points: DayPoint[] }) {
  const [active, setActive] = useState<string | null>(null);

  const max = seriesMax(points);
  const top = axisTop(max);
  const ticks = axisTicks(top).reverse();
  const hasData = max > 0;

  return (
    <div className="chart">
      <div className="chart-legend">
        {SERIES.map((series) => (
          <span key={series.key} className="chart-key">
            <span className={`chart-swatch chart-swatch-${series.key}`} aria-hidden />
            {series.label}
          </span>
        ))}
      </div>

      <div className="chart-plot">
        <div className="chart-axis-y" aria-hidden>
          {ticks.map((tick) => (
            <span key={tick}>{tick.toLocaleString()}</span>
          ))}
        </div>

        <div className="chart-grid">
          {ticks.map((tick) => (
            <div key={tick} className="chart-gridline" aria-hidden />
          ))}

          <div className="chart-cols">
            {points.map((point) => {
              const isActive = active === point.date;
              return (
                <div
                  key={point.date}
                  className="chart-col"
                  data-active={isActive}
                  onMouseEnter={() => setActive(point.date)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(point.date)}
                  onBlur={() => setActive(null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${formatDayLabel(point.date)}: ${point.sent} sent, ${point.opened} opened, ${point.replied} replied`}
                >
                  <div className="chart-bars">
                    {SERIES.map((series) => {
                      const value = point[series.key as SeriesKey];
                      return (
                        <div
                          key={series.key}
                          className={`chart-bar chart-bar-${series.key}`}
                          style={{ height: top > 0 ? `${(value / top) * 100}%` : "0%" }}
                        />
                      );
                    })}
                  </div>

                  {isActive ? (
                    <div className="chart-tip" role="tooltip">
                      <strong>{formatDayLabel(point.date)}</strong>
                      {SERIES.map((series) => (
                        <span key={series.key}>
                          <span className={`chart-swatch chart-swatch-${series.key}`} aria-hidden />
                          {series.label}
                          <b className="num">{point[series.key as SeriesKey].toLocaleString()}</b>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="chart-axis-x" aria-hidden>
        {points.map((point) => (
          <span key={point.date}>{formatDayLabel(point.date)}</span>
        ))}
      </div>

      {!hasData ? (
        <p className="chart-empty subtle">
          No send, open or reply events in this window yet. Bars appear as the mail worker records them.
        </p>
      ) : null}

      {/* Relief for the sub-3:1 light steps, and the keyboard/screen-reader path. */}
      <details className="chart-table">
        <summary>View as table</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                {SERIES.map((series) => (
                  <th key={series.key} scope="col" className="num">
                    {series.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{formatDayLabel(point.date)}</th>
                  {SERIES.map((series) => (
                    <td key={series.key} className="num">
                      {point[series.key as SeriesKey].toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
