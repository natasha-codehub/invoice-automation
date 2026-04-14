const STAR_CARDS = [
  {
    label: 'SITUATION',
    color: '#6366f1',
    title: 'Legacy process: 38% straight-through, 62% manual',
    body: `The accounts payable team was processing 400+ invoices per week. Only 38% cleared automatically via the incumbent third-party tool. The remaining 62% required human intervention — not because they were genuinely complex, but because the rules engine had no normalisation layer and no tolerance dial. Every minor formatting variance triggered a human queue.`,
  },
  {
    label: 'TASK',
    color: '#f59e0b',
    title: 'Define what "better" looks like before building anything',
    body: `Before writing a line of code, I established the measurement framework: STP rate as the north-star metric, exception type breakdown as the feedback signal, and tolerance threshold as the negotiable dial. I ran a 2-week audit of exception types and found that 73% of manual reviews were caused by just 4 fixable patterns — vendor aliases, PO format variance, goods receipt lag, and amount rounding. The product bet: a normalisation layer + configurable tolerance would move the needle faster than any rules expansion.`,
  },
  {
    label: 'ACTION',
    color: '#10b981',
    title: '3-bucket routing + normalisation + exception feedback loop',
    body: `Built a validation engine with 7 ordered checks (6 core + goods receipt) and a pre-normalisation layer that auto-corrects vendor aliases, PO formatting, and date formats before any check runs. Introduced a 3-bucket taxonomy — Straight Through, Auto-Corrected, and Human Review — so every exception is categorised and measurable. Crucially, negotiated the 2% variance tolerance threshold with the finance team and built it as a configurable dial, not a hardcoded rule. Weekly exception analysis feeds directly back into the alias map and normalisation rules.`,
  },
  {
    label: 'RESULT',
    color: '#ef4444',
    title: '38% → 91% STP over 8 weeks · exceptions became a product roadmap',
    body: `STP rate climbed from 38% to 91% over 8 weeks. The majority of the improvement came in weeks 2–5 as normalisation rules accumulated from exception analysis. The tolerance dial was loosened from 1% to 2% at week 4 after the model demonstrated consistent behaviour — this single change moved 11% more invoices to straight-through. More importantly, the exception signal identified two vendors requiring EDI integration (Salesforce, AWS) — turning a queue into a product roadmap item.`,
  },
];

const PRINCIPLES = [
  { text: 'Defined measurement before building', color: '#6366f1' },
  { text: 'Made a bet on AI over rules-based', color: '#f59e0b' },
  { text: 'Negotiated the tolerance as a dial', color: '#10b981' },
  { text: 'Exceptions → feedback, not failures', color: '#ef4444' },
];

export default function StoryTab() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={{ marginBottom: 4 }}>
        <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          PM Story — Invoice Automation
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>
          STAR format · the decisions behind the system, not just the system itself
        </div>
      </div>

      {STAR_CARDS.map(card => (
        <div key={card.label} style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: `4px solid ${card.color}`,
          borderRadius: 6,
          padding: '18px 22px',
        }}>
          <div style={{
            color: card.color,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            marginBottom: 8,
          }}>
            {card.label}
          </div>
          <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
            {card.title}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.8 }}>
            {card.body}
          </div>
        </div>
      ))}

      {/* Principle chips */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        {PRINCIPLES.map(p => (
          <div key={p.text} style={{
            padding: '7px 14px',
            background: p.color + '15',
            border: `1px solid ${p.color}44`,
            borderRadius: 20,
            color: p.color,
            fontSize: 11,
            fontWeight: 500,
          }}>
            {p.text}
          </div>
        ))}
      </div>

    </div>
  );
}
