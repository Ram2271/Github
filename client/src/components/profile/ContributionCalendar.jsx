import React, { useMemo } from 'react';

export default function ContributionCalendar({ calendarData = {}, totalContributions = 0 }) {
  // Generate 52 weeks (364 days) of squares
  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    const days = [];
    const months = [];

    // Go back ~52 weeks (364 days)
    for (let i = 363; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = calendarData[dateStr] || 0;
      days.push({ date: dateStr, count, dayOfWeek: d.getDay() });
    }

    // Group into weeks of 7 days
    const weekGroups = [];
    let currentWeek = [];
    let lastMonth = -1;

    for (let i = 0; i < days.length; i++) {
      const item = days[i];
      currentWeek.push(item);

      const d = new Date(item.date);
      const monthIndex = d.getMonth();
      if (monthIndex !== lastMonth && currentWeek.length === 1) {
        months.push({
          name: d.toLocaleString('default', { month: 'short' }),
          weekIndex: weekGroups.length
        });
        lastMonth = monthIndex;
      }

      if (currentWeek.length === 7 || i === days.length - 1) {
        weekGroups.push(currentWeek);
        currentWeek = [];
      }
    }

    return { weeks: weekGroups, monthLabels: months };
  }, [calendarData]);

  const getColor = (count) => {
    if (count === 0) return 'bg-[#161b22] border-[#30363d]/40';
    if (count <= 2) return 'bg-[#0e4429] border-[#0e4429]';
    if (count <= 4) return 'bg-[#006d32] border-[#006d32]';
    if (count <= 7) return 'bg-[#26a641] border-[#26a641]';
    return 'bg-[#39d353] border-[#39d353]';
  };

  return (
    <div className="border border-gh-border rounded-md bg-gh-surface p-4 text-xs space-y-3">
      <div className="flex items-center justify-between font-semibold text-gh-text">
        <span>{totalContributions} contributions in the last year</span>
        <span className="text-gh-muted text-[11px] font-normal">Contribution settings</span>
      </div>

      <div className="overflow-x-auto pb-2">
        {/* Month labels */}
        <div className="flex text-[10px] text-gh-muted mb-1 ml-6 h-4 relative min-w-[720px]">
          {monthLabels.map((m, idx) => (
            <span
              key={idx}
              className="absolute"
              style={{ left: `${m.weekIndex * 13}px` }}
            >
              {m.name}
            </span>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex gap-1 items-start min-w-[720px]">
          {/* Day of week labels */}
          <div className="flex flex-col gap-1 text-[9px] text-gh-muted pr-2 leading-[10px]">
            <span>&nbsp;</span>
            <span>Mon</span>
            <span>&nbsp;</span>
            <span>Wed</span>
            <span>&nbsp;</span>
            <span>Fri</span>
            <span>&nbsp;</span>
          </div>

          {/* 52 Columns of 7 rows */}
          <div className="flex gap-[3px]">
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <div
                    key={day.date}
                    className={`w-[10px] h-[10px] rounded-sm border ${getColor(day.count)} transition-all hover:scale-125 hover:z-10 relative group cursor-pointer`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 pointer-events-none">
                      <div className="bg-gray-900 text-white text-[10px] rounded py-1 px-2 whitespace-nowrap shadow-xl border border-gh-border">
                        <strong>{day.count} contributions</strong> on {day.date}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between pt-2 border-t border-gh-border/50 text-[11px] text-gh-muted">
        <span>Learn how we count contributions</span>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          <span className="w-2.5 h-2.5 rounded-sm bg-[#161b22] border border-[#30363d]/40 inline-block" />
          <span className="w-2.5 h-2.5 rounded-sm bg-[#0e4429] inline-block" />
          <span className="w-2.5 h-2.5 rounded-sm bg-[#006d32] inline-block" />
          <span className="w-2.5 h-2.5 rounded-sm bg-[#26a641] inline-block" />
          <span className="w-2.5 h-2.5 rounded-sm bg-[#39d353] inline-block" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
