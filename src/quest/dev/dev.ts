// Временный стенд экрана квеста для ручной проверки и скриншотов (не входит в сборку).
import '../../app/app.css';
import { createStore, SAVE_KEY } from '../../core/state';
import { createSfx } from '../../services/sfx';
import { createQuestController } from '../controller';
import { mountQuestScreen } from '../screen';

const q = new URLSearchParams(location.search);
if (q.has('reset')) localStorage.removeItem(SAVE_KEY);
const root = document.getElementById('ezq-app')!;
if (q.get('theme') === 'light') root.dataset.ezqTheme = 'light';
const host = document.createElement('div');
host.className = 'ezq-screen-host ezq-devhost';
root.appendChild(host);
const store = createStore({ storage: localStorage });
const sfx = createSfx(() => store.get().navigation.isAudioMuted);
const controller = createQuestController(store, { onCompleted: (s) => console.log('completed', s.quest.verificationCode) });
const screen = mountQuestScreen(host, {
  store,
  sfx,
  controller,
  isServerConfigured: q.has('server'),
  onGoToArcade: () => console.log('go arcade'),
});
Object.assign(window, { ezqDev: { store, controller, screen } });
