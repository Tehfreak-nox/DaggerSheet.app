import { go, home, replace } from '../app/nav';
import { updateCharacter, useStore } from '../app/store';
import { endScene, mustLongRest, newSession, transformationOf } from '../rules';
import { toast } from '../app/toast';
import { effectiveMode, toggleMode } from '../app/theme';
import { Header, themeAttrs } from '../ui/Header';
import { CharacterTab } from './CharacterTab';
import { EquipmentTab } from './EquipmentTab';

export function Sheet({ id, tab = 'character' }: { id: string; tab?: 'character' | 'equipment' }) {
  const ch = useStore((s) => s.characters[id]);
  if (!ch) {
    return (
      <div className="s" style={{ padding: 24 }}>
        <p>That character isn’t on this device.</p>
        <button className="s-btn" onClick={home}>All characters</button>
      </div>
    );
  }
  const longOnly = mustLongRest(ch);
  return (
    <div className="s" {...themeAttrs(ch)}>
      <Header
        persona={ch}
        tab={tab}
        onTab={(t) => replace({ name: 'sheet', id, tab: t })}
        onHome={home}
        menu={[
          { label: 'Short rest', note: longOnly ? 'Long rest needed' : `${ch.shortRestStreak}/3 in a row`, disabled: longOnly, onClick: () => go({ name: 'rest', id, kind: 'short' }) },
          { label: 'Long rest', onClick: () => go({ name: 'rest', id, kind: 'long' }) },
          { label: 'Level up', note: ch.level >= 10 ? 'Max level' : `to ${ch.level + 1}`, disabled: ch.level >= 10, onClick: () => go({ name: 'levelup', id }) },
          { label: 'End scene', note: 'Stances and scene effects end', onClick: () => { updateCharacter(id, endScene); toast('Scene ended: per-scene uses refreshed.'); } },
          { label: 'New session', note: 'Refresh per-session uses', onClick: () => { updateCharacter(id, (c) => newSession(c)); toast('New session: per-session uses refreshed.'); } },
          { label: 'Transformation', note: transformationOf(ch)?.name ?? 'None', onClick: () => go({ name: 'transformation', id }) },
          { label: 'Cards & vault', onClick: () => go({ name: 'vault', id }) },
          { label: 'Light / dark mode', note: effectiveMode() === 'dark' ? 'Dark' : 'Light', onClick: () => toggleMode() },
        ]}
      />
      {tab === 'character' ? <CharacterTab ch={ch} /> : <EquipmentTab ch={ch} />}
    </div>
  );
}
