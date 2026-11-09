import { TransformationPicker } from './screens/Transformation';
import { useEffect } from 'react';
import { back, useScreen } from './app/nav';
import { connectAccount, useStore } from './app/store';
import { themeAttrs } from './ui/Header';
import { About } from './screens/About';
import { BeastformPicker } from './screens/Beastform';
import { Create } from './screens/Create';
import { Home } from './screens/Home';
import { LevelUp } from './screens/LevelUp';
import { Picker } from './screens/Picker';
import { Rest } from './screens/Rest';
import { Sheet } from './screens/Sheet';
import { Vault } from './screens/Vault';
import { RollOverlay } from './ui/RollOverlay';
import { Toast } from './ui/Toast';

export function App() {
  const s = useScreen();
  const ch = useStore((st) => ('id' in s ? st.characters[s.id] : undefined));
  useEffect(() => { void connectAccount(); }, []);
  let view: React.ReactNode;
  switch (s.name) {
    case 'home': view = <Home />; break;
    case 'about': view = <About />; break;
    case 'create': view = <Create />; break;
    case 'sheet': view = <Sheet key={s.id} id={s.id} tab={s.tab} />; break;
    case 'vault': view = <Vault id={s.id} />; break;
    case 'picker': view = <Picker id={s.id} kind={s.kind} />; break;
    case 'rest': view = <Rest id={s.id} kind={s.kind} />; break;
    case 'levelup': view = <LevelUp id={s.id} />; break;
    case 'beastform': view = <BeastformPicker id={s.id} via={s.via} />; break;
    case 'transformation': view = <TransformationPicker id={s.id} />; break;
    default: view = <button onClick={back}>Back</button>;
  }
  return (
    <div className="app">
      {view}
      <div className="s" {...(ch ? themeAttrs(ch) : {})}>
        <RollOverlay />
        <Toast />
      </div>
    </div>
  );
}
