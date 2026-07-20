import { useEffect, useState } from 'react';
import { Check, Loader2, MapPin, Mountain, Ruler, Sparkles, TreePine, Waves } from 'lucide-react';
import { fetchSiteContext, type SiteContext } from '../../services/siteContext';

interface SiteContextCardProps {
  address?: string;
}

/**
 * Friendly "here's what I found about your place" card. Pulls the municipal site
 * context for the address and shows the homeowner what the app already knows — and,
 * warmly, which permit forms it has already handled for them.
 */
export function SiteContextCard({ address }: SiteContextCardProps) {
  const [context, setContext] = useState<SiteContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    let active = true;
    setLoading(true);
    fetchSiteContext(address)
      .then((result) => { if (active) setContext(result); })
      .catch(() => { if (active) setContext(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [address]);

  if (!address) return null;

  const handled = context ? buildHandled(context) : [];
  const longestEdge = context ? Math.max(0, ...context.perimeter.edges.map((e) => e.lengthM)) : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm">
      <div className="flex items-center gap-2.5 px-5 pt-4">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-700 text-white"><Sparkles size={16} /></span>
        <div>
          <h3 className="font-[Manrope] text-lg font-bold text-emerald-950">Here's what I found about your place</h3>
          <p className="text-xs text-emerald-800/80">Pulled straight from the Town map — so you don't have to.</p>
        </div>
        {loading && <Loader2 size={16} className="ml-auto animate-spin text-emerald-700" />}
      </div>

      {context && (
        <>
          <div className="grid grid-cols-2 gap-2.5 px-5 py-4 sm:grid-cols-4">
            <Stat icon={<Mountain size={15} />} label="Ground elevation" value={context.elevation.minM != null ? `${context.elevation.minM}–${context.elevation.maxM} m` : '—'} />
            <Stat icon={<Ruler size={15} />} label="Longest lot edge" value={longestEdge ? `${longestEdge} m` : '—'} />
            <Stat icon={<MapPin size={15} />} label="To the road" value={context.road?.distanceM != null ? `${context.road.distanceM} m` : '—'} />
            <Stat icon={<Waves size={15} />} label="To the water" value={context.waterProximity ? `${context.waterProximity.distanceM} m` : '—'} />
          </div>

          {handled.length > 0 && (
            <div className="border-t border-emerald-100 bg-white/60 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-[.1em] text-emerald-800">Handled for you</p>
              <ul className="mt-2.5 grid gap-2">
                {handled.map((item) => (
                  <li key={item.text} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">{item.icon || <Check size={12} strokeWidth={3} />}</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!context && !loading && (
        <p className="px-5 py-4 text-sm text-slate-500">Couldn't reach the Town map just now — you can still continue; I'll fill this in when it's back.</p>
      )}
    </section>
  );
}

function buildHandled(context: SiteContext): Array<{ text: string; icon?: React.ReactNode }> {
  const items: Array<{ text: string; icon?: React.ReactNode }> = [];
  items.push({ text: `Your lot lines and setbacks — traced from the Town map (${context.perimeter.edges.length} edges).` });
  if (context.zoning) items.push({ text: `Zoning confirmed: ${context.zoning.class} — I'll apply the right setbacks.` });
  if (context.triggers.floodFcl) items.push({ text: 'Your lot sits low near the water, so the flood (FCL) form is added — I\'ve got it.', icon: <Waves size={12} /> });
  if (context.triggers.esaSiteServicing) items.push({ text: 'Your lot is in an environmentally sensitive area, so the site-servicing step is added.' });
  if (context.triggers.arborist) items.push({ text: `There ${context.protectedTreesNearby === 1 ? 'is a protected tree' : 'are protected trees'} nearby — I\'ve prepared the tree-protection step.`, icon: <TreePine size={12} /> });
  if (context.triggers.easementOnSitePlan) items.push({ text: 'A right-of-way runs through your lot — it\'ll show on your site plan automatically.' });
  return items;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-emerald-700">{icon}<span className="text-[10px] font-bold uppercase tracking-[.08em] text-slate-500">{label}</span></div>
      <div className="mt-1 font-[Manrope] text-lg font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
