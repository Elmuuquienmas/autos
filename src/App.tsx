import { useEffect, useState } from 'react';
import ControlPanel from './ControlPanel';
import RaceTrack from './RaceTrack';

function App() {
  const [isTicker, setIsTicker] = useState(false);

  useEffect(() => {
    const checkMode = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const isShortHeight = window.innerHeight < 300;
      setIsTicker(isLandscape || isShortHeight);
    };
    checkMode();
    window.addEventListener('resize', checkMode);
    return () => window.removeEventListener('resize', checkMode);
  }, []);

  return isTicker ? <RaceTrack /> : <ControlPanel />;
}

export default App;