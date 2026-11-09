import { back } from '../app/nav';
import { updateCharacter, useStore } from '../app/store';
import { toast } from '../app/toast';
import { transformationRules, transformations } from '../data';
import { themeAttrs } from '../ui/Header';
import { Page, Rich } from '../ui/kit';

/** Take a Transformation (or give it up): it joins your heritage and applies on its own. */
export function TransformationPicker({ id }: { id: string }) {
  const ch = useStore((s) => s.characters[id]);
  if (!ch) return null;
  const pick = (t: string | undefined) => {
    updateCharacter(id, (c) => ({ ...c, transformation: t }));
    toast(t ? `${transformations.find((x) => x.id === t)?.name}: on your Heritage tab.` : 'Transformation removed.');
    back();
  };
  return (
    <div className="s" {...themeAttrs(ch)}>
      <Page title="Transformation" onClose={back}>
        <p className="s-muted" style={{ fontSize: 15, lineHeight: 1.45 }}>{transformationRules.split('\n\n')[0]} A character can’t have more than one.</p>
        {transformations.map((t) => {
          const on = ch.transformation === t.id;
          return (
            <article key={t.id} className={`feat ${on ? 's-armed' : ''}`}>
              <div className="s-row"><span className="s-feat-name">{t.name}</span>{on && <span className="s-label">Yours</span>}</div>
              <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>{t.description.split('\n\n')[0]}</span>
              {t.features.map((f) => (
                <div key={f.id} className="feat-section">
                  <span className="s-feat-name" style={{ fontSize: 16 }}>{f.name}</span>
                  <Rich text={f.text} />
                </div>
              ))}
              <button className={`s-btn s-press ${on ? '' : 'solid'}`} onClick={() => pick(on ? undefined : t.id)}>{on ? 'Remove' : `Become a ${t.name}`}</button>
            </article>
          );
        })}
      </Page>
    </div>
  );
}
