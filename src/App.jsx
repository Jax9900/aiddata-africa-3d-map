import { useMemo, useState } from "react";
import { BarChart3, Database, Layers3, MapPinned, RotateCcw, Table2 } from "lucide-react";
import { max } from "d3-array";
import { format } from "d3-format";
import { scaleLinear, scaleSqrt } from "d3-scale";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import compactAidData from "./data/aiddataCompact.json";
import { countryIsoByNumericId, countryNamesByIso } from "./data/africaCountryCodes";

const MAP_WIDTH = 980;
const MAP_HEIGHT = 760;
const AFRICA_BOUNDS = {
  minLng: -19,
  maxLng: 53,
  minLat: -36,
  maxLat: 39,
};

const SECTOR_COLORS = {
  Energy: "#ffb04f",
  Transport: "#f06d5e",
  "Industry / Mining": "#c252b8",
  "Finance / Budget": "#6f8df5",
  Communications: "#43b8c5",
  "Infrastructure Other": "#9cc96b",
  "Water / Sanitation": "#55a6ff",
  Other: "#9ca3af",
  Health: "#e25576",
  Agriculture: "#67c587",
  Education: "#e6c84f",
  "Government / Public": "#b78cff",
};

const FINANCIER_COLORS = {
  "State-owned Policy Bank": "#ffb04f",
  "State-owned Commercial Bank": "#f06d5e",
  "Government Agency": "#55a6ff",
  "State-owned Company": "#c252b8",
  Unspecified: "#9ca3af",
};

const formatMoney = format("$,.1f");
const formatCount = format(",");

const aidData = {
  ...compactAidData,
  records: compactAidData.rows.map(([countryIndex, yearOffset, sectorIndex, financierIndex, value, count], index) => {
    const country = compactAidData.countries[countryIndex];
    const sector = compactAidData.sectorOrder[sectorIndex];
    return {
      id: `agg-${index}`,
      ISO: country.ISO,
      country: country.country,
      year: 2000 + yearOffset,
      sector,
      rawSector: sector,
      financierType: compactAidData.financierOrder[financierIndex],
      flowType: "Aggregated",
      status: "Aggregated",
      intent: "Development",
      value,
      count,
      title: `${sector} AidData aggregate (${count} records)`,
    };
  }),
};

const africaGeoJson = {
  type: "FeatureCollection",
  features: feature(worldAtlas, worldAtlas.objects.countries).features
    .map((country) => {
      const numericId = String(country.id).padStart(3, "0");
      const ISO = countryIsoByNumericId[numericId];
      if (!ISO) return null;
      return {
        ...country,
        properties: {
          ISO,
          name: countryNamesByIso[ISO] ?? ISO,
        },
      };
    })
    .filter(Boolean),
};

function projectPoint([lng, lat]) {
  const x = ((lng - AFRICA_BOUNDS.minLng) / (AFRICA_BOUNDS.maxLng - AFRICA_BOUNDS.minLng)) * MAP_WIDTH;
  const y = MAP_HEIGHT - ((lat - AFRICA_BOUNDS.minLat) / (AFRICA_BOUNDS.maxLat - AFRICA_BOUNDS.minLat)) * MAP_HEIGHT;
  return [x, y];
}

function geometryPath(geometry) {
  const ringPath = (ring) =>
    ring
      .map((point, index) => {
        const [x, y] = projectPoint(point);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ") + " Z";

  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringPath).join(" ");
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map(ringPath))
      .join(" ");
  }

  return "";
}

function walkCoordinates(geometry, points = []) {
  if (!geometry?.coordinates) return points;

  const visit = (value) => {
    if (typeof value?.[0] === "number" && typeof value?.[1] === "number") {
      points.push(value);
      return;
    }
    value.forEach(visit);
  };

  visit(geometry.coordinates);
  return points;
}

function featureCentroid(feature) {
  const points = walkCoordinates(feature.geometry);
  if (!points.length) return [MAP_WIDTH / 2, MAP_HEIGHT / 2];

  const bounds = points.reduce(
    (acc, [lng, lat]) => ({
      minLng: Math.min(acc.minLng, lng),
      maxLng: Math.max(acc.maxLng, lng),
      minLat: Math.min(acc.minLat, lat),
      maxLat: Math.max(acc.maxLat, lat),
    }),
    { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity, maxLatSeen: -Infinity },
  );

  return projectPoint([(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2]);
}

function mixColor(from, to, amount) {
  const parse = (hex) => hex.replace("#", "").match(/.{1,2}/g).map((part) => parseInt(part, 16));
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const channel = (a, b) => Math.round(a + (b - a) * amount);
  return `rgb(${channel(r1, r2)}, ${channel(g1, g2)}, ${channel(b1, b2)})`;
}

function shadeColor(hex, amount) {
  return mixColor(hex, amount >= 0 ? "#ffffff" : "#000000", Math.min(Math.abs(amount), 1));
}

function categoryColor(category, mode, index) {
  if (mode === "sector") {
    return SECTOR_COLORS[category] ?? ["#ffb04f", "#55a6ff", "#e25576", "#67c587"][index % 4];
  }

  return FINANCIER_COLORS[category] ?? ["#ffb04f", "#f06d5e", "#55a6ff", "#c252b8", "#67c587"][index % 5];
}

function metricValue(item, unit) {
  return unit === "amount" ? item.value : item.count;
}

function formatMetric(value, unit) {
  return unit === "amount" ? `${formatMoney(value)}B` : `${formatCount(value)} records`;
}

function getRecordGroup(record, mode) {
  return mode === "sector" ? record.sector : record.financierType;
}

function recordCount(record) {
  return record.count ?? 1;
}

function toggleSet(setter, value, allValues = null) {
  setter((current) => {
    const next = new Set(current);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }

    if (allValues && next.size === 0) {
      return new Set(allValues);
    }

    return next;
  });
}

function buildCountryIndex(records, groupOrder, mode) {
  const countries = new Map();

  for (const record of records) {
    if (!countries.has(record.ISO)) {
      countries.set(record.ISO, {
        ISO: record.ISO,
        country: record.country,
        value: 0,
        count: 0,
        segments: new Map(),
        records: [],
      });
    }

    const country = countries.get(record.ISO);
    const group = getRecordGroup(record, mode);
    country.value += record.value;
    country.count += recordCount(record);
    country.records.push(record);

    if (!country.segments.has(group)) {
      country.segments.set(group, { group, value: 0, count: 0 });
    }

    const segment = country.segments.get(group);
    segment.value += record.value;
    segment.count += recordCount(record);
  }

  return Array.from(countries.values()).map((country) => ({
    ...country,
    value: Number(country.value.toFixed(6)),
    segments: groupOrder
      .map((group) => country.segments.get(group))
      .filter(Boolean)
      .map((segment) => ({ ...segment, value: Number(segment.value.toFixed(6)) })),
    topProjects: country.records.slice().sort((a, b) => b.value - a.value).slice(0, 3),
  }));
}

function buildGroupedTable(records, groupOrder, mode, unit) {
  const groups = new Map();

  for (const record of records) {
    const groupName = getRecordGroup(record, mode);
    if (!groups.has(groupName)) {
      groups.set(groupName, { group: groupName, value: 0, count: 0, countries: new Map() });
    }

    const group = groups.get(groupName);
    group.value += record.value;
    group.count += recordCount(record);

    if (!group.countries.has(record.ISO)) {
      group.countries.set(record.ISO, {
        ISO: record.ISO,
        country: record.country,
        value: 0,
        count: 0,
        records: [],
      });
    }

    const country = group.countries.get(record.ISO);
    country.value += record.value;
    country.count += recordCount(record);
    country.records.push(record);
  }

  const order = new Map(groupOrder.map((name, index) => [name, index]));

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      value: Number(group.value.toFixed(6)),
      countries: Array.from(group.countries.values())
        .map((country) => ({
          ...country,
          value: Number(country.value.toFixed(6)),
          records: country.records.slice().sort((a, b) => b.value - a.value),
        }))
        .sort((a, b) => metricValue(b, unit) - metricValue(a, unit)),
    }))
    .sort((a, b) => {
      const metricDelta = metricValue(b, unit) - metricValue(a, unit);
      return metricDelta || (order.get(a.group) ?? 999) - (order.get(b.group) ?? 999);
    });
}

function isActiveSelection(set, value) {
  return set.size === 0 || set.has(value);
}

function StatNumber({ label, value, tone = "gold" }) {
  return (
    <div className={`stat-number stat-number--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SegmentedButton({ active, icon: Icon, label, onClick }) {
  return (
    <button className={active ? "segmented segmented--active" : "segmented"} onClick={onClick} type="button">
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function YearFilter({ years, totals, activeYears, maxYearMetric, unit, onToggle, onReset }) {
  return (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Year Filter</span>
          <h2>年份范围</h2>
        </div>
        <button className="icon-button" onClick={onReset} title="重置年份" type="button">
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="year-bars" role="list">
        {years.map((year) => {
          const total = totals.get(year) ?? { value: 0, count: 0 };
          const height = maxYearMetric ? 12 + (metricValue(total, unit) / maxYearMetric) * 78 : 12;
          const active = activeYears.has(year);
          return (
            <button
              className={active ? "year-bar year-bar--active" : "year-bar"}
              key={year}
              onClick={() => onToggle(year)}
              title={`${year}: ${formatMetric(metricValue(total, unit), unit)}`}
              type="button"
            >
              <span className="year-bar__column" style={{ height }} />
              <span className="year-bar__label">{String(year).slice(2)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BreakdownFilter({ groups, totals, unit, activeGroups, mode, onToggle, onReset }) {
  const maxMetric = max(groups, (group) => metricValue(totals.get(group) ?? { value: 0, count: 0 }, unit)) || 1;

  return (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Type Filter</span>
          <h2>{mode === "sector" ? "行业分组" : "融资方类型"}</h2>
        </div>
        <button className="icon-button" onClick={onReset} title="显示全部分组" type="button">
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="type-bars">
        {groups.map((group, index) => {
          const total = totals.get(group) ?? { value: 0, count: 0 };
          const metric = metricValue(total, unit);
          const active = isActiveSelection(activeGroups, group);
          return (
            <button
              className={active ? "type-row type-row--active" : "type-row"}
              key={group}
              onClick={() => onToggle(group)}
              type="button"
            >
              <span className="type-row__swatch" style={{ backgroundColor: categoryColor(group, mode, index) }} />
              <span className="type-row__label">{group}</span>
              <span className="type-row__track">
                <span
                  className="type-row__fill"
                  style={{
                    width: `${Math.max(3, (metric / maxMetric) * 100)}%`,
                    backgroundColor: categoryColor(group, mode, index),
                  }}
                />
              </span>
              <strong>{formatMetric(metric, unit)}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CountryBars({ countries, heightScale, maxMetric, unit, mode, selectedCountries, onHover, onLeave, onToggle }) {
  return countries.map((country) => {
    const [x, y] = country.centroid;
    const totalMetric = metricValue(country, unit);
    if (!totalMetric) return null;

    const totalHeight = heightScale(totalMetric);
    const width = totalMetric / maxMetric > 0.55 ? 15 : 11;
    const depthX = 7;
    const depthY = -5;
    let offset = 0;
    const selected = selectedCountries.size === 0 || selectedCountries.has(country.ISO);

    return (
      <g
        className={selected ? "country-column" : "country-column country-column--muted"}
        key={`bar-${country.ISO}`}
        onClick={() => onToggle(country.ISO)}
        onMouseLeave={onLeave}
        onMouseMove={(event) => onHover(event, country, "column")}
      >
        <ellipse className="column-shadow" cx={x + 3} cy={y + 4} rx={width + 7} ry="5.5" />
        {country.segments.map((segment, index) => {
          const segmentMetric = metricValue(segment, unit);
          const segmentHeight = Math.max(1.5, (segmentMetric / totalMetric) * totalHeight);
          const yBottom = y - offset;
          const yTop = yBottom - segmentHeight;
          const color = categoryColor(segment.group, mode, index);
          offset += segmentHeight;

          return (
            <g key={`${country.ISO}-${segment.group}`}>
              <polygon
                className="column-face column-face--front"
                fill={color}
                points={`${x - width / 2},${yTop} ${x + width / 2},${yTop} ${x + width / 2},${yBottom} ${x - width / 2},${yBottom}`}
              />
              <polygon
                className="column-face column-face--side"
                fill={shadeColor(color, -0.28)}
                points={`${x + width / 2},${yTop} ${x + width / 2 + depthX},${yTop + depthY} ${x + width / 2 + depthX},${yBottom + depthY} ${x + width / 2},${yBottom}`}
              />
              {Math.abs(offset - totalHeight) < 2 && (
                <polygon
                  className="column-face column-face--top"
                  fill={shadeColor(color, 0.18)}
                  points={`${x - width / 2},${yTop} ${x + width / 2},${yTop} ${x + width / 2 + depthX},${yTop + depthY} ${x - width / 2 + depthX},${yTop + depthY}`}
                />
              )}
            </g>
          );
        })}
      </g>
    );
  });
}

function Callouts({ countries, unit }) {
  return countries.slice(0, 4).map((country, index) => {
    const [x, y] = country.centroid;
    const top = country.topProjects[0];
    const side = x > MAP_WIDTH * 0.55 ? -1 : 1;
    const labelX = x + side * (54 + index * 4);
    const labelY = y - 124 - index * 8;

    return (
      <g className="callout" key={`callout-${country.ISO}`}>
        <path d={`M${x + 6},${y - 72} C${x + side * 24},${y - 96} ${labelX - side * 20},${labelY + 12} ${labelX},${labelY + 12}`} />
        <rect height="48" rx="8" width="188" x={labelX - (side < 0 ? 188 : 0)} y={labelY - 10} />
        <text x={labelX + (side < 0 ? -176 : 12)} y={labelY + 7}>
          {country.country}
        </text>
        <text className="callout__metric" x={labelX + (side < 0 ? -176 : 12)} y={labelY + 24}>
          {formatMetric(metricValue(country, unit), unit)}
        </text>
        <text className="callout__project" x={labelX + (side < 0 ? -176 : 12)} y={labelY + 39}>
          {(top?.title ?? "Major AidData record").slice(0, 28)}
        </text>
      </g>
    );
  });
}

function AfricaMap({
  features,
  countryMap,
  countrySummaries,
  choroplethScale,
  heightScale,
  maxCountryMetric,
  unit,
  mode,
  selectedCountries,
  onHover,
  onLeave,
  onToggleCountry,
}) {
  const orderedColumns = countrySummaries
    .filter((country) => metricValue(country, unit) > 0)
    .slice()
    .sort((a, b) => a.centroid[1] - b.centroid[1]);
  const callouts =
    selectedCountries.size === 0
      ? []
      : orderedColumns
          .filter((country) => selectedCountries.has(country.ISO))
          .sort((a, b) => metricValue(b, unit) - metricValue(a, unit));

  return (
    <svg className="africa-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="AidData Africa map">
      <defs>
        <radialGradient id="mapGlow" cx="50%" cy="48%" r="58%">
          <stop offset="0%" stopColor="#2a3345" stopOpacity="0.94" />
          <stop offset="65%" stopColor="#141a24" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#0b1018" stopOpacity="1" />
        </radialGradient>
        <linearGradient id="amountRamp" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#232c3a" />
          <stop offset="100%" stopColor="#d4a23c" />
        </linearGradient>
      </defs>

      <rect fill="url(#mapGlow)" height={MAP_HEIGHT} width={MAP_WIDTH} />
      <g className="map-grid">
        {[-20, 0, 20, 40].map((lat) => {
          const [, y] = projectPoint([0, lat]);
          return <line key={`lat-${lat}`} x1="38" x2={MAP_WIDTH - 34} y1={y} y2={y} />;
        })}
        {[-10, 10, 30, 50].map((lng) => {
          const [x] = projectPoint([lng, 0]);
          return <line key={`lng-${lng}`} x1={x} x2={x} y1="42" y2={MAP_HEIGHT - 34} />;
        })}
      </g>

      <g className="countries">
        {features.map((feature) => {
          const iso = feature.properties.ISO;
          const summary = countryMap.get(iso);
          const metric = summary ? metricValue(summary, unit) : 0;
          const intensity = choroplethScale(metric);
          const selected = selectedCountries.size === 0 || selectedCountries.has(iso);
          return (
            <path
              className={selected ? "country-path" : "country-path country-path--muted"}
              d={feature.path}
              fill={metric ? mixColor("#222b39", "#d7a23a", intensity) : "#1a2230"}
              key={iso}
              onClick={() => onToggleCountry(iso)}
              onMouseLeave={onLeave}
              onMouseMove={(event) =>
                onHover(event, summary ?? { ISO: iso, country: feature.properties.name, value: 0, count: 0, segments: [] }, "country")
              }
            />
          );
        })}
      </g>

      <CountryBars
        countries={orderedColumns}
        heightScale={heightScale}
        maxMetric={maxCountryMetric}
        mode={mode}
        onHover={onHover}
        onLeave={onLeave}
        onToggle={onToggleCountry}
        selectedCountries={selectedCountries}
        unit={unit}
      />

      <Callouts countries={callouts} unit={unit} />
    </svg>
  );
}

function Tooltip({ hover, unit, mode }) {
  if (!hover) return null;

  const item = hover.item;
  const segments = item.segments?.slice(0, 5) ?? [];
  return (
    <div className="tooltip" style={{ left: hover.x + 16, top: hover.y + 16 }}>
      <span>{hover.type === "column" ? "3D Column" : "Country"}</span>
      <strong>{item.country}</strong>
      <div className="tooltip__metric">{formatMetric(metricValue(item, unit), unit)}</div>
      <small>{formatMoney(item.value ?? 0)}B · {formatCount(item.count ?? 0)} records</small>
      {segments.length > 0 && (
        <div className="tooltip__segments">
          {segments.map((segment, index) => (
            <p key={segment.group}>
              <i style={{ backgroundColor: categoryColor(segment.group, mode, index) }} />
              {segment.group}
              <b>{formatMetric(metricValue(segment, unit), unit)}</b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend({ groups, mode }) {
  return (
    <div className="map-legend">
      <div className="choropleth-legend">
        <span>Country total</span>
        <i />
        <small>low</small>
        <small>high</small>
      </div>
      <div className="segment-legend">
        {groups.slice(0, 8).map((group, index) => (
          <span key={group}>
            <i style={{ backgroundColor: categoryColor(group, mode, index) }} />
            {group}
          </span>
        ))}
      </div>
    </div>
  );
}

function DataTable({
  groups,
  expandedGroups,
  expandedCountries,
  onToggleGroup,
  onToggleCountry,
  unit,
  mode,
}) {
  return (
    <aside className="data-panel">
      <div className="panel-title">
        <Table2 size={18} />
        <div>
          <span className="eyebrow">Linked Table</span>
          <h2>AidData 明细</h2>
        </div>
      </div>
      <div className="table-note">按当前年份、国家和类型筛选联动；展开后显示该国家金额最高的记录。</div>
      <div className="group-table">
        {groups.map((group, index) => {
          const groupOpen = expandedGroups.has(group.group);
          return (
            <section className="table-group" key={group.group}>
              <button className="table-group__head" onClick={() => onToggleGroup(group.group)} type="button">
                <span className="type-row__swatch" style={{ backgroundColor: categoryColor(group.group, mode, index) }} />
                <strong>{group.group}</strong>
                <b>{formatMetric(metricValue(group, unit), unit)}</b>
              </button>

              {groupOpen && (
                <div className="table-group__body">
                  {group.countries.slice(0, 10).map((country) => {
                    const key = `${group.group}-${country.ISO}`;
                    const countryOpen = expandedCountries.has(key);
                    return (
                      <div className="country-records" key={key}>
                        <button className="country-records__head" onClick={() => onToggleCountry(key)} type="button">
                          <span>{country.country}</span>
                          <b>{formatMetric(metricValue(country, unit), unit)}</b>
                        </button>
                        {countryOpen && (
                          <div className="record-list">
                            {country.records.slice(0, 5).map((record) => (
                              <article key={record.id}>
                                <strong>{record.year}</strong>
                                <span>{record.title}</span>
                                <b>{formatMoney(record.value)}B</b>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

export default function App() {
  const allYears = aidData.years;
  const [unit, setUnit] = useState("amount");
  const [mode, setMode] = useState("sector");
  const [activeYears, setActiveYears] = useState(() => new Set(allYears));
  const [activeGroups, setActiveGroups] = useState(() => new Set());
  const [selectedCountries, setSelectedCountries] = useState(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(["Energy"]));
  const [expandedCountries, setExpandedCountries] = useState(() => new Set());
  const [hover, setHover] = useState(null);

  const mapFeatures = useMemo(
    () =>
      africaGeoJson.features.map((feature) => ({
        ...feature,
        path: geometryPath(feature.geometry),
        centroid: featureCentroid(feature),
      })),
    [],
  );

  const centroidByIso = useMemo(() => new Map(mapFeatures.map((feature) => [feature.properties.ISO, feature.centroid])), [mapFeatures]);

  const groupOrder = mode === "sector" ? aidData.sectorOrder : aidData.financierOrder;
  const visibleGroups = groupOrder.filter((group) => isActiveSelection(activeGroups, group));

  const filteredByYearAndType = useMemo(
    () =>
      aidData.records.filter((record) => activeYears.has(record.year) && isActiveSelection(activeGroups, getRecordGroup(record, mode))),
    [activeGroups, activeYears, mode],
  );

  const activeRecords = useMemo(
    () =>
      filteredByYearAndType.filter((record) => selectedCountries.size === 0 || selectedCountries.has(record.ISO)),
    [filteredByYearAndType, selectedCountries],
  );

  const countrySummaries = useMemo(() => {
    const summaries = buildCountryIndex(filteredByYearAndType, visibleGroups, mode)
      .map((country) => ({
        ...country,
        centroid: centroidByIso.get(country.ISO) ?? [MAP_WIDTH / 2, MAP_HEIGHT / 2],
      }))
      .filter((country) => centroidByIso.has(country.ISO));
    return summaries;
  }, [centroidByIso, filteredByYearAndType, mode, visibleGroups]);

  const countryMap = useMemo(() => new Map(countrySummaries.map((country) => [country.ISO, country])), [countrySummaries]);

  const maxCountryMetric = max(countrySummaries, (country) => metricValue(country, unit)) || 1;
  const heightScale = useMemo(() => scaleSqrt().domain([0, maxCountryMetric]).range([7, 160]), [maxCountryMetric]);
  const choroplethScale = useMemo(() => scaleLinear().domain([0, maxCountryMetric]).range([0.04, 1]), [maxCountryMetric]);

  const stats = useMemo(() => {
    const value = activeRecords.reduce((total, record) => total + record.value, 0);
    const countries = new Set(activeRecords.map((record) => record.ISO));
    return {
      value,
      count: activeRecords.reduce((total, record) => total + recordCount(record), 0),
      countries: countries.size,
    };
  }, [activeRecords]);

  const yearTotals = useMemo(() => {
    const totals = new Map(allYears.map((year) => [year, { value: 0, count: 0 }]));
    for (const record of aidData.records) {
      if (!isActiveSelection(activeGroups, getRecordGroup(record, mode))) continue;
      if (selectedCountries.size > 0 && !selectedCountries.has(record.ISO)) continue;
      const total = totals.get(record.year);
      if (!total) continue;
      total.value += record.value;
      total.count += recordCount(record);
    }
    return totals;
  }, [activeGroups, allYears, mode, selectedCountries]);

  const maxYearMetric = max(Array.from(yearTotals.values()), (total) => metricValue(total, unit)) || 1;

  const groupTotals = useMemo(() => {
    const totals = new Map(groupOrder.map((group) => [group, { value: 0, count: 0 }]));
    for (const record of aidData.records) {
      if (!activeYears.has(record.year)) continue;
      if (selectedCountries.size > 0 && !selectedCountries.has(record.ISO)) continue;
      const group = getRecordGroup(record, mode);
      if (!totals.has(group)) totals.set(group, { value: 0, count: 0 });
      const total = totals.get(group);
      total.value += record.value;
      total.count += recordCount(record);
    }
    return totals;
  }, [activeYears, groupOrder, mode, selectedCountries]);

  const tableGroups = useMemo(
    () => buildGroupedTable(activeRecords, groupOrder, mode, unit),
    [activeRecords, groupOrder, mode, unit],
  );

  const topCountries = useMemo(
    () => countrySummaries.slice().sort((a, b) => metricValue(b, unit) - metricValue(a, unit)).slice(0, 5),
    [countrySummaries, unit],
  );

  const handleHover = (event, item, type) => {
    setHover({ x: event.clientX, y: event.clientY, item, type });
  };

  const resetAll = () => {
    setActiveYears(new Set(allYears));
    setActiveGroups(new Set());
    setSelectedCountries(new Set());
    setHover(null);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <MapPinned size={20} />
          </div>
          <div>
            <span className="eyebrow">AidData 3.0 · Africa · 2000-2021</span>
            <h1>中国对非洲发展融资 3D 分布</h1>
          </div>
        </div>

        <div className="topbar-controls">
          <div className="segmented-group" aria-label="Breakdown mode">
            <SegmentedButton active={mode === "sector"} icon={Layers3} label="行业" onClick={() => { setMode("sector"); setActiveGroups(new Set()); }} />
            <SegmentedButton active={mode === "financier"} icon={Database} label="融资方" onClick={() => { setMode("financier"); setActiveGroups(new Set()); }} />
          </div>
          <div className="segmented-group" aria-label="Metric unit">
            <SegmentedButton active={unit === "amount"} icon={BarChart3} label="金额" onClick={() => setUnit("amount")} />
            <SegmentedButton active={unit === "count"} icon={Table2} label="记录数" onClick={() => setUnit("count")} />
          </div>
          <button className="reset-button" onClick={resetAll} type="button">
            <RotateCcw size={15} />
            重置
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="control-panel">
          <section className="panel-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Overview</span>
                <h2>当前筛选</h2>
              </div>
            </div>
            <div className="stat-grid">
              <StatNumber label="总额" value={`${formatMoney(stats.value)}B`} />
              <StatNumber label="记录" tone="blue" value={formatCount(stats.count)} />
              <StatNumber label="国家" tone="green" value={formatCount(stats.countries)} />
            </div>
            <p className="source-note">
              数据来自 {aidData.meta.source}；金额字段为 2021 年不变价美元，按 AidData 推荐聚合口径过滤。
            </p>
          </section>

          <YearFilter
            activeYears={activeYears}
            maxYearMetric={maxYearMetric}
            onReset={() => setActiveYears(new Set(allYears))}
            onToggle={(year) => toggleSet(setActiveYears, year, allYears)}
            totals={yearTotals}
            unit={unit}
            years={allYears}
          />

          <BreakdownFilter
            activeGroups={activeGroups}
            groups={groupOrder}
            mode={mode}
            onReset={() => setActiveGroups(new Set())}
            onToggle={(group) => toggleSet(setActiveGroups, group)}
            totals={groupTotals}
            unit={unit}
          />
        </aside>

        <section className="map-panel">
          <div className="map-toolbar">
            <div>
              <span className="eyebrow">SVG Map + Isometric Columns</span>
              <h2>非洲国家分布</h2>
            </div>
            <div className="map-toolbar__meta">
              <span>{activeYears.size === allYears.length ? "2000-2021" : `${activeYears.size} 年已选`}</span>
              <span>{selectedCountries.size ? `${selectedCountries.size} 国已选` : "全部国家"}</span>
            </div>
          </div>

          <AfricaMap
            choroplethScale={choroplethScale}
            countryMap={countryMap}
            countrySummaries={countrySummaries}
            features={mapFeatures}
            heightScale={heightScale}
            maxCountryMetric={maxCountryMetric}
            mode={mode}
            onHover={handleHover}
            onLeave={() => setHover(null)}
            onToggleCountry={(iso) => toggleSet(setSelectedCountries, iso)}
            selectedCountries={selectedCountries}
            unit={unit}
          />

          <Legend groups={visibleGroups.length ? visibleGroups : groupOrder} mode={mode} />

          <div className="top-country-strip">
            {topCountries.map((country) => (
              <button key={country.ISO} onClick={() => toggleSet(setSelectedCountries, country.ISO)} type="button">
                <span>{country.country}</span>
                <strong>{formatMetric(metricValue(country, unit), unit)}</strong>
              </button>
            ))}
          </div>
        </section>

        <DataTable
          expandedCountries={expandedCountries}
          expandedGroups={expandedGroups}
          groups={tableGroups}
          mode={mode}
          onToggleCountry={(key) => toggleSet(setExpandedCountries, key)}
          onToggleGroup={(group) => toggleSet(setExpandedGroups, group)}
          unit={unit}
        />
      </main>

      <Tooltip hover={hover} mode={mode} unit={unit} />
    </div>
  );
}
