import { useEffect, useState, useRef } from 'react';
import { db } from './firebase';
import { ref, onValue, remove, set, get } from 'firebase/database';
import { QRCodeSVG } from 'qrcode.react';

// Agregamos 'sessionClicks' para los clicks de la ronda actual
type Car = { id: string; name: string; image: string; level: string; clicks: number; sessionClicks?: number };

export default function RaceTrack() {
  const [racers, setRacers] = useState<Car[]>([]);
  const [isRacing, setIsRacing] = useState(false);
  
  // ESTADOS JUEGO
  const [scores, setScores] = useState({ p1: 0, p2: 0 });
  const [round, setRound] = useState(1);
  const [winner, setWinner] = useState<string | null>(null);
  const [seriesWinner, setSeriesWinner] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [pitStopTimer, setPitStopTimer] = useState<number | null>(null); // TIEMPO PARA CLICKEAR

  // HISTORIAL
  const [history, setHistory] = useState<Car[]>([]);
  
  const car1Ref = useRef<HTMLDivElement>(null);
  const car2Ref = useRef<HTMLDivElement>(null);
  const car1Pos = useRef(0);
  const car2Pos = useRef(0);
  const raceLoop = useRef<number>();

  // 1. ESCUCHAR SALA DE ESPERA (Solo si no hay carrera activa)
  useEffect(() => {
    if (isRacing) return;

    const waitingRef = ref(db, 'waiting_room');
    const unsubscribe = onValue(waitingRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const carList: Car[] = Object.entries(data).map(([key, val]: any) => ({
          id: key, ...val
        }));
        setRacers(carList);

        if (carList.length >= 2) {
          startSeries(carList[0], carList[1]);
        }
      } else {
        setRacers([]);
      }
    });
    return () => unsubscribe();
  }, [isRacing]);

  // 2. INICIAR SERIE (BEST OF 3)
  const startSeries = async (carA: Car, carB: Car) => {
    setIsRacing(true);
    
    // Quitamos de sala de espera
    remove(ref(db, `waiting_room/${carA.id}`)).catch(() => {});
    remove(ref(db, `waiting_room/${carB.id}`)).catch(() => {});

    // INICIALIZAMOS LA CARRERA ACTIVA EN FIREBASE PARA LOS TELÉFONOS
    const activeRaceRef = ref(db, 'active_race');
    await set(activeRaceRef, {
      p1: carA,
      p2: carB,
      status: 'RACING', // Estado inicial
      round: 1
    });

    setRacers([carA, carB]);
    setScores({ p1: 0, p2: 0 });
    setRound(1);
    setSeriesWinner(null);
    
    // Arrancamos Ronda 1 directo
    startRound(carA, carB);
  };

  const startRound = (carA: Car, carB: Car) => {
    // Avisamos a Firebase que estamos corriendo (Bloquea botones en tels)
    set(ref(db, 'active_race/status'), 'RACING');

    car1Pos.current = 0;
    car2Pos.current = 0;
    setWinner(null);

    if (car1Ref.current) car1Ref.current.style.transform = `translateX(0vw)`;
    if (car2Ref.current) car2Ref.current.style.transform = `translateX(0vw)`;

    let count = 3;
    setCountdown(`RONDA ${round}`);
    
    setTimeout(() => {
        const timer = setInterval(() => {
            if (count > 0) setCountdown(String(count));
            else if (count === 0) setCountdown("GO!");
            else {
                clearInterval(timer);
                setCountdown(null);
                runEngine(carA, carB);
            }
            count--;
        }, 800);
    }, 1500);
  };

  const runEngine = async (carA: Car, carB: Car) => {
    // 1. OBTENER CLICKS ACTUALIZADOS DE FIREBASE (LO QUE CLICKEARON EN EL PIT STOP)
    const snapshot = await get(ref(db, 'active_race'));
    const raceData = snapshot.val();
    
    // Sumamos los clicks base + los de la sesión actual
    const clicksA = (raceData?.p1?.clicks || 0) + (raceData?.p1?.sessionClicks || 0);
    const clicksB = (raceData?.p2?.clicks || 0) + (raceData?.p2?.sessionClicks || 0);

    // DETERMINAR GANADOR BASADO EN CLICKS Y AZAR
    // Más clicks = Más probabilidad y velocidad base
    let totalClicks = clicksA + clicksB;
    if (totalClicks === 0) totalClicks = 1; // Evitar division por 0

    const probA = (clicksA / totalClicks) + 0.1; // Base de suerte
    const winnerIndex = Math.random() < probA ? 0 : 1;

    let speedA = 0.35 + (clicksA * 0.01); // Cada click da velocidad
    let speedB = 0.35 + (clicksB * 0.01);

    // Boost al ganador determinado
    if (winnerIndex === 0) speedA += 0.2; else speedB += 0.2;

    const animate = () => {
      if (!car1Ref.current || !car2Ref.current) return;
      car1Pos.current += speedA;
      car2Pos.current += speedB;

      car1Ref.current.style.transform = `translateX(${car1Pos.current}vw)`;
      car2Ref.current.style.transform = `translateX(${car2Pos.current}vw)`;

      if (car1Pos.current >= 85 || car2Pos.current >= 85) {
        cancelAnimationFrame(raceLoop.current!);
        const wName = car1Pos.current > car2Pos.current ? carA.name : carB.name;
        const wIndex = car1Pos.current > car2Pos.current ? 0 : 1;
        handleRoundEnd(wName, wIndex);
      } else {
        raceLoop.current = requestAnimationFrame(animate);
      }
    };
    raceLoop.current = requestAnimationFrame(animate);
  };

  const handleRoundEnd = (winnerName: string, winnerIndex: number) => {
    setWinner(winnerName);
    const newScores = { ...scores };
    if (winnerIndex === 0) newScores.p1 += 1; else newScores.p2 += 1;
    setScores(newScores);

    setTimeout(() => {
        if (newScores.p1 >= 2 || newScores.p2 >= 2) {
            // --- FIN DE LA SERIE ---
            setSeriesWinner(winnerName);
            
            // Guardamos en historial
            // Actualizamos los clicks totales sumando lo que hicieron en la serie
            const finalP1 = { ...racers[0], clicks: (racers[0].clicks || 0) }; // Solo visual
            const finalP2 = { ...racers[1], clicks: (racers[1].clicks || 0) };
            
            setHistory(prev => [finalP1, finalP2, ...prev].slice(0, 5));
            
            // BORRAMOS LA CARRERA ACTIVA -> ESTO RESETEA LOS TELÉFONOS
            setTimeout(() => { 
                remove(ref(db, 'active_race')); 
                setIsRacing(false); 
                setRacers([]); 
            }, 8000);

        } else {
            // --- PIT STOP (TIEMPO DE CLICKS) ---
            triggerPitStop();
        }
    }, 3000);
  };

  const triggerPitStop = () => {
    // AVISAMOS A TELÉFONOS: ¡HORA DE CLICKEAR!
    set(ref(db, 'active_race/status'), 'PIT_STOP');
    
    // Reseteamos contadores de sesión para que empiecen de 0 esta ronda
    set(ref(db, 'active_race/p1/sessionClicks'), 0);
    set(ref(db, 'active_race/p2/sessionClicks'), 0);

    let pitTime = 5;
    setPitStopTimer(pitTime);

    const pitInterval = setInterval(() => {
        pitTime--;
        setPitStopTimer(pitTime);
        if (pitTime <= 0) {
            clearInterval(pitInterval);
            setPitStopTimer(null);
            setRound(prev => prev + 1);
            startRound(racers[0], racers[1]); // Volvemos a correr
        }
    }, 1000);
  };

  // --- VISTA LOBBY (Igual que antes) ---
  if (!isRacing) {
    const p1 = racers[0];
    const qrUrl = "https://autos-plum.vercel.app/"; // Pon tu URL aquí

    return (
      <div className="w-screen h-screen bg-black flex items-center border-y-4 border-orange-600 px-4 overflow-hidden relative font-sans">
         <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>

         {/* IZQUIERDA: P1 + QR */}
         <div className="z-10 w-[40%] h-[90%] flex mr-4">
            <div className={`flex-grow h-full flex items-center bg-gray-900 border border-orange-500 rounded-l-lg p-2 gap-2 shadow-lg overflow-hidden ${!p1 ? 'justify-center' : ''}`}>
               {p1 ? (
                 <>
                   <img src={p1.image} className="h-full w-auto max-w-[50%] object-contain bg-black/50 rounded flex-shrink-0" />
                   <div className="flex flex-col justify-center h-full min-w-0">
                      <span className="text-orange-500 font-bold text-[10px] uppercase tracking-widest leading-none mb-1">Retador</span>
                      <h1 className="text-white font-black text-xl uppercase leading-none truncate">{p1.name}</h1>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-gray-400 font-mono text-xs bg-gray-800 px-1 rounded">NVL {p1.level}</span>
                      </div>
                   </div>
                 </>
               ) : (
                  <div className="text-gray-500 font-bold animate-pulse text-lg">ESPERANDO J1...</div>
               )}
            </div>
            <div className="h-full bg-white p-2 flex flex-col items-center justify-center rounded-r-lg border-l-2 border-gray-200 min-w-[100px]">
               <QRCodeSVG value={qrUrl} size={80} />
               <p className="text-black text-[9px] font-bold mt-1 uppercase text-center leading-none">Escanea<br/>para jugar</p>
            </div>
         </div>

         {/* CENTRO: HISTORIAL */}
         <div className="z-10 w-[25%] h-[90%] flex flex-col bg-gray-900/50 border border-gray-700 rounded-lg p-2 mr-4 overflow-hidden">
             <h3 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest border-b border-gray-700 pb-1 mb-1 text-center">Salón de la Fama</h3>
             {history.length === 0 ? <div className="h-full flex items-center justify-center text-gray-600 text-xs italic">Sin registros</div> : (
                 <div className="flex flex-col gap-1 w-full">
                     {history.slice(0, 5).map((car, idx) => (
                         <div key={idx} className="flex items-center justify-between bg-black/40 p-1 rounded px-2">
                             <span className="text-white text-xs font-bold truncate">{car.name}</span>
                         </div>
                     ))}
                 </div>
             )}
         </div>

         {/* DERECHA: P2 */}
         <div className="z-10 flex-grow h-[90%] flex items-center justify-center border-2 border-gray-800 border-dashed rounded-lg bg-gray-900/30">
            <div className="text-gray-600 font-bold animate-pulse text-lg tracking-widest text-center px-2">ESPERANDO RIVAL</div>
         </div>
      </div>
    );
  }

  // --- VISTA CARRERA ---
  return (
    <div className="relative w-screen h-screen bg-neutral-900 overflow-hidden border-y-4 border-orange-600 flex flex-col">
       <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,_#333_1px,_transparent_1px)] [background-size:20px_20px]"></div>
       
       {/* PANTALLA DE PIT STOP / BOOST */}
       {pitStopTimer && (
          <div className="absolute inset-0 z-40 bg-red-600/90 flex flex-col items-center justify-center animate-pulse">
             <h1 className="text-yellow-300 font-black text-[15vh] uppercase leading-none">¡BOOST!</h1>
             <h2 className="text-white font-bold text-4xl mt-2">PICA TU TELÉFONO AHORA</h2>
             <div className="text-[10vh] font-mono font-bold text-white mt-4">{pitStopTimer}s</div>
          </div>
       )}

       {/* MARCADOR */}
       <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0 opacity-30 text-[10vh] font-black text-white flex gap-10">
        <span>{scores.p1}</span><span>-</span><span>{scores.p2}</span>
      </div>

      <div className="relative h-1/2 w-full border-b border-dashed border-gray-600 flex items-end">
        <div ref={car1Ref} className="absolute left-0 h-[85%] w-auto will-change-transform z-10 pl-2 pb-1">
           <img src={racers[0].image} className="h-full w-auto object-contain drop-shadow-2xl" />
           <div className="absolute -top-1 left-2 bg-orange-600/90 text-white text-[10px] font-bold px-2 rounded-sm skew-x-[-10deg] whitespace-nowrap overflow-hidden max-w-[150px] truncate">{racers[0].name} {scores.p1>=1 && '★'}</div>
        </div>
      </div>
      <div className="relative h-1/2 w-full flex items-end">
        <div ref={car2Ref} className="absolute left-0 h-[85%] w-auto will-change-transform z-10 pl-2 pb-1">
           <img src={racers[1].image} className="h-full w-auto object-contain drop-shadow-2xl" />
           <div className="absolute -top-1 left-2 bg-blue-600/90 text-white text-[10px] font-bold px-2 rounded-sm skew-x-[-10deg] whitespace-nowrap overflow-hidden max-w-[150px] truncate">{racers[1].name} {scores.p2>=1 && '★'}</div>
        </div>
      </div>

      <div className="absolute right-[15%] top-0 bottom-0 w-8 bg-[repeating-linear-gradient(45deg,#fff,#fff_10px,#000_10px,#000_20px)] opacity-60 z-0"></div>
      
      {countdown && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"><h1 className="text-orange-500 font-black animate-ping drop-shadow-md text-center leading-none" style={{ fontSize: '10vh' }}>{countdown}</h1></div>}
      
      {winner && !seriesWinner && !pitStopTimer && <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50"><h2 className="text-white text-lg font-bold tracking-widest uppercase">Ganador Ronda {round}</h2><div className="text-orange-500 font-black text-6xl transform -rotate-2">{winner}</div></div>}
      
      {seriesWinner && <div className="absolute inset-0 bg-gradient-to-r from-orange-900 to-black flex flex-col items-center justify-center z-50 animate-pulse"><h2 className="text-yellow-400 text-2xl font-black tracking-[0.5em] mb-2 drop-shadow-lg">REY DE LA PISTA</h2><div className="bg-white text-black font-black px-8 py-2 text-5xl transform skew-x-[-15deg] border-4 border-orange-500 shadow-[0_0_50px_rgba(255,165,0,0.8)]">{seriesWinner}</div></div>}
    </div>
  );
}