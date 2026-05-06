import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, AlertTriangle, TrendingDown, CheckCircle2, Zap, BarChart3, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportSeverity = 'critical' | 'high' | 'medium' | 'low' | 'positive';

export interface ReportAction {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  text: string;
  owner?: string;
  deadline?: string;
}

export interface ReportEvidence {
  text: string;
}

export interface AYNReport {
  title: string;
  severity: ReportSeverity;
  summary: string;
  evidence?: ReportEvidence[];
  rootCause?: string;
  businessImpact?: string[];
  actions?: ReportAction[];
  confidence?: number;
  sources?: number;
}

interface AYNReportCardProps {
  report: AYNReport;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const severityConfig: Record<ReportSeverity, {
  label: string;
  labelColor: string;
  badgeBg: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  critical: {
    label: 'Critical',
    labelColor: 'text-red-400',
    badgeBg: 'bg-red-500/15 text-red-400 border-red-500/20',
    borderColor: 'border-l-red-500',
    icon: AlertTriangle,
  },
  high: {
    label: 'High Risk',
    labelColor: 'text-orange-400',
    badgeBg: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    borderColor: 'border-l-orange-400',
    icon: ShieldAlert,
  },
  medium: {
    label: 'Medium',
    labelColor: 'text-yellow-400',
    badgeBg: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    borderColor: 'border-l-yellow-400',
    icon: TrendingDown,
  },
  low: {
    label: 'Low',
    labelColor: 'text-blue-400',
    badgeBg: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    borderColor: 'border-l-blue-400',
    icon: BarChart3,
  },
  positive: {
    label: 'Positive',
    labelColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    borderColor: 'border-l-emerald-400',
    icon: CheckCircle2,
  },
};

const actionPriorityConfig = {
  CRITICAL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  MEDIUM: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const AYNReportCard = ({ report, className }: AYNReportCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const config = severityConfig[report.severity];
  const SeverityIcon = config.icon;

  const hasExpandableContent =
    (report.evidence && report.evidence.length > 0) ||
    report.rootCause ||
    (report.businessImpact && report.businessImpact.length > 0) ||
    (report.actions && report.actions.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.25, duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'mt-2 rounded-xl overflow-hidden',
        'border border-border/40 dark:border-white/8',
        'bg-background/60 dark:bg-gray-950/80',
        'backdrop-blur-sm',
        `border-l-[3px] ${config.borderColor}`,
        className
      )}
    >
      {/* ── Header ── */}
      <button
        onClick={() => hasExpandableContent && setIsOpen((v) => !v)}
        className={cn(
          'w-full flex items-start gap-3 px-4 py-3 text-left',
          'transition-colors duration-150',
          hasExpandableContent
            ? 'hover:bg-muted/30 cursor-pointer'
            : 'cursor-default'
        )}
        aria-expanded={isOpen}
      >
        {/* Icon */}
        <div className={cn('mt-0.5 flex-shrink-0', config.labelColor)}>
          <SeverityIcon className="w-4 h-4" />
        </div>

        {/* Title + summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
              AYN Report
            </span>
            <span
              className={cn(
                'text-[10px] font-medium px-2 py-0.5 rounded-full border',
                config.badgeBg
              )}
            >
              {config.label}
            </span>
            {report.confidence !== undefined && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {report.confidence}% confidence
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">
            {report.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {report.summary}
          </p>
        </div>

        {/* Expand toggle */}
        {hasExpandableContent && (
          <div className="flex-shrink-0 mt-1 text-muted-foreground/60">
            {isOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        )}
      </button>

      {/* ── Expandable body ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border/30">

              {/* Evidence */}
              {report.evidence && report.evidence.length > 0 && (
                <section className="pt-3">
                  <SectionLabel>Evidence from company data</SectionLabel>
                  <div className="space-y-1.5 mt-2">
                    {report.evidence.map((ev, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground leading-relaxed">
                          {ev.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Root cause */}
              {report.rootCause && (
                <section>
                  <SectionLabel>Root cause</SectionLabel>
                  <p className="mt-1.5 text-xs text-foreground/80 leading-relaxed bg-muted/30 rounded-lg px-3 py-2 border border-border/20">
                    {report.rootCause}
                  </p>
                </section>
              )}

              {/* Business impact */}
              {report.businessImpact && report.businessImpact.length > 0 && (
                <section>
                  <SectionLabel>Business impact</SectionLabel>
                  <div className="space-y-1.5 mt-2">
                    {report.businessImpact.map((impact, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400/70 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground leading-relaxed">
                          {impact}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Actions */}
              {report.actions && report.actions.length > 0 && (
                <section>
                  <SectionLabel>Recommended actions</SectionLabel>
                  <div className="space-y-2 mt-2">
                    {report.actions.map((action, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 bg-muted/20 rounded-lg px-3 py-2 border border-border/20"
                      >
                        <span
                          className={cn(
                            'text-[9px] font-semibold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 tracking-wide',
                            actionPriorityConfig[action.priority]
                          )}
                        >
                          {action.priority}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground/90 leading-snug">
                            {action.text}
                          </p>
                          {(action.owner || action.deadline) && (
                            <p className="text-[10px] text-primary/70 mt-0.5">
                              {[action.owner, action.deadline]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Verification footer */}
              {(report.sources !== undefined || report.confidence !== undefined) && (
                <div className="flex items-center gap-2 pt-1 mt-1 border-t border-border/20">
                  <Zap className="w-3 h-3 text-primary/60" />
                  <span className="text-[10px] text-muted-foreground">
                    AYN Verified
                    {report.sources !== undefined &&
                      ` · ${report.sources} company sources`}
                    {report.confidence !== undefined &&
                      ` · ${report.confidence}% confidence`}
                    {' · CEO-ready'}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
    {children}
  </p>
);

export default AYNReportCard;
