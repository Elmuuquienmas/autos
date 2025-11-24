import { useEffect, useState, useRef } from 'react';
import { db } from './firebase';
import { ref, onValue, remove, set } from 'firebase/database';
import { QRCodeSVG } from 'qrcode.react';

type Car = { id: string; name: string; image: string; level: string; clicks: number; };

export default function RaceTrack() {
  const [racers, setRacers] = useState<Car[]>([]);
  const [isRacing, setIsRacing] = useState(false);
  
  // ESTADOS DE CARRERA
  const [winner, setWinner] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  // HISTORIAL
  const [history, setHistory] = useState<{winner: Car, loser: Car}[]>([]);
  
  // REFS PARA ANIMACIÓN
  const car1Ref = useRef<HTMLDivElement>(null);
  const car2Ref = useRef<HTMLDivElement>(null);
  const car1Pos = useRef(0);
  const car2Pos = useRef(0);
  const raceLoop = useRef<number>();

  // 1. ESCUCHAR SALA DE ESPERA
  useEffect(() => {
    // Solo escuchamos si NO estamos en la fase visual de carrera
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
          startRaceSequence(carList[0], carList[1]);
        }
      } else {
        setRacers([]);
      }
    });
    return () => unsubscribe();
  }, [isRacing]);

  // 2. INICIAR SECUENCIA
  const startRaceSequence = async (carA: Car, carB: Car) => {
    setIsRacing(true);
    setRacers([carA, carB]); 

    // Limpiar Firebase
    remove(ref(db, `waiting_room/${carA.id}`)).catch(() => {});
    remove(ref(db, `waiting_room/${carB.id}`)).catch(() => {});

    // Señal para teléfonos
    set(ref(db, 'active_race'), { p1: carA.id, p2: carB.id, status: 'RACING' });

    // Resetear posiciones y estilos
    car1Pos.current = 0;
    car2Pos.current = 0;
    setWinner(null);
    if (car1Ref.current) car1Ref.current.style.transform = `translateX(0vw)`;
    if (car2Ref.current) car2Ref.current.style.transform = `translateX(0vw)`;

    let count = 3;
    setCountdown("3");
    
    const timer = setInterval(() => {
      count--;
      if (count > 0) setCountdown(String(count));
      else if (count === 0) setCountdown("GO!");
      else {
        clearInterval(timer);
        setCountdown(null);
        // Pequeño delay para asegurar que el DOM se actualizó
        requestAnimationFrame(() => runEngine(carA, carB));
      }
    }, 1000);
  };

  // 3. MOTOR DE FÍSICA
  const runEngine = (carA: Car, carB: Car) => {
    const clicksA = carA.clicks || 0;
    const clicksB = carB.clicks || 0;
    let totalClicks = clicksA + clicksB;
    if (totalClicks === 0) totalClicks = 1;

    const probA = (clicksA / totalClicks); 
    const winnerIsA = Math.random() < probA ? true : (Math.random() < 0.5); 

    let speedA = 0.3 + (clicksA * 0.005);
    let speedB = 0.3 + (clicksB * 0.005);

    if (winnerIsA) speedA += 0.15; else speedB += 0.15;

    const animate = () => {
      if (!car1Ref.current || !car2Ref.current) return;

      car1Pos.current += speedA;
      car2Pos.current += speedB;

      car1Ref.current.style.transform = `translateX(${car1Pos.current}vw)`;
      car2Ref.current.style.transform = `translateX(${car2Pos.current}vw)`;

      if (car1Pos.current >= 85 || car2Pos.current >= 85) {
        cancelAnimationFrame(raceLoop.current!);
        const wName = car1Pos.current > car2Pos.current ? carA.name : carB.name;
        finishRace(wName, carA, carB, car1Pos.current > car2Pos.current);
      } else {
        raceLoop.current = requestAnimationFrame(animate);
      }
    };
    raceLoop.current = requestAnimationFrame(animate);
  };

  const finishRace = (winnerName: string, carA: Car, carB: Car, aWon: boolean) => {
    setWinner(winnerName);
    const resultEntry = { winner: aWon ? carA : carB, loser: aWon ? carB : carA };
    setHistory(prev => [resultEntry, ...prev].slice(0, 5));

    setTimeout(() => {
        setIsRacing(false);
        setRacers([]);
        remove(ref(db, 'active_race'));
    }, 8000);
  };

  // --- RENDERIZADO (ESTRATEGIA DE CAPAS) ---
  const p1 = racers[0];
  const qrUrl = "https://autos-plum.vercel.app/"; 

  return (
    <div className="relative w-screen h-screen bg-neutral-900 overflow-hidden border-y-4 border-orange-600 font-sans">
       <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,_#333_1px,_transparent_1px)] [background-size:20px_20px]"></div>

       {/* =================================================================================
           CAPA 1: LOBBY (SALA DE ESPERA)
           Se muestra SOLO si !isRacing.
           Usamos anchos fijos (w-[35%], etc) para evitar desbordes.
       ================================================================================= */}
       {!isRacing && (
         <div className="absolute inset-0 z-20 bg-black flex items-center px-4 animate-in fade-in duration-500">
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>

            {/* IZQUIERDA: P1 + QR (ANCHO FIJO 40%) */}
            <div className="z-10 w-[40%] h-[90%] flex mr-2 flex-shrink-0">
                {/* Tarjeta P1 */}
                <div className={`flex-1 h-full flex items-center bg-gray-900 border border-orange-500 rounded-l-lg p-2 gap-2 shadow-lg overflow-hidden ${!p1 ? 'justify-center' : ''}`}>
                    {p1 ? (
                        <>
                        <img src={p1.image} className="h-full w-auto max-w-[45%] object-contain bg-black/50 rounded flex-shrink-0" />
                        <div className="flex flex-col justify-center h-full min-w-0 flex-1">
                            <span className="text-orange-500 font-bold text-[10px] uppercase tracking-widest leading-none mb-1">Retador 1</span>
                            <h1 className="text-white font-black text-xl uppercase leading-none truncate w-full">{p1.name}</h1>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-yellow-400 font-mono text-xs font-bold border border-yellow-600 px-1 rounded bg-yellow-900/30 truncate">⚡ {p1.clicks} POTENCIA</span>
                            </div>
                        </div>
                        </>
                    ) : (
                        <div className="text-gray-500 font-bold animate-pulse text-lg tracking-widest text-center">ESPERANDO J1...</div>
                    )}
                </div>
                {/* QR */}
                <div className="w-[90px] h-full bg-white p-1 flex flex-col items-center justify-center rounded-r-lg border-l-2 border-gray-200 flex-shrink-0">
                    <QRCodeSVG value={qrUrl} size={70} />
                    <p className="text-black text-[8px] font-bold mt-1 uppercase text-center leading-none">Escanea<br/>para jugar</p>
                </div>
            </div>

            {/* CENTRO: TABLA DE RESULTADOS (ANCHO FIJO 25%) */}
            <div className="z-10 w-[25%] h-[90%] flex flex-col bg-gray-900/80 border border-gray-700 rounded-lg p-2 mr-2 overflow-hidden flex-shrink-0">
                <h3 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest border-b border-gray-700 pb-1 mb-1 text-center">Resultados</h3>
                {history.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-600 text-xs italic">Listo para correr</div>
                ) : (
                    <div className="flex flex-col gap-1 w-full overflow-y-auto">
                        {history.map((entry, idx) => (
                            <div key={idx} className="flex flex-col bg-black/40 p-1 rounded border-l-2 border-green-500">
                                <span className="text-white text-[10px] font-bold truncate">🏆 {entry.winner.name}</span>
                                <span className="text-gray-500 text-[8px] truncate">vs {entry.loser.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* DERECHA: ESPERANDO P2 (ANCHO FIJO 35% o RESTANTE) */}
            <div className="z-10 flex-1 h-[90%] flex items-center justify-center border-2 border-gray-800 border-dashed rounded-lg bg-gray-900/30">
                <div className="text-gray-600 font-bold animate-pulse text-lg tracking-widest text-center px-2">ESPERANDO RIVAL</div>
            </div>
         </div>
       )}

       {/* =================================================================================
           CAPA 2: PISTA DE CARRERAS
           Siempre está renderizada (para que los Refs funcionen), pero visible solo si isRacing
       ================================================================================= */}
       <div className={`absolute inset-0 z-10 flex flex-col transition-opacity duration-300 ${isRacing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          
          {/* META */}
          <div className="absolute right-[15%] top-0 bottom-0 w-10 bg-[repeating-linear-gradient(45deg,#fff,#fff_15px,#000_15px,#000_30px)] opacity-80 z-0 shadow-[0_0_20px_rgba(0,0,0,0.8)]"></div>

          {/* CARRIL 1 (SUPERIOR) */}
          <div className="relative h-1/2 w-full border-b border-dashed border-gray-600 flex items-end">
            <div ref={car1Ref} className="absolute left-0 h-[85%] w-auto will-change-transform z-10 pl-2 pb-1">
                {/* SIEMPRE RENDERIZAR IMAGEN SI EXISTE, SIN IMPORTAR ESTADO */}
                {racers[0] && (
                    <div className="relative h-full">
                        <img src={racers[0].image} className="h-full w-auto object-contain drop-shadow-2xl" />
                        <div className="absolute -top-2 left-2 bg-orange-600 text-white text-[10px] font-black px-2 py-0.5 rounded-sm skew-x-[-10deg] shadow-lg whitespace-nowrap max-w-[200px] truncate">
                            {racers[0].name}
                        </div>
                    </div>
                )}
            </div>
          </div>

          {/* CARRIL 2 (INFERIOR) */}
          <div className="relative h-1/2 w-full flex items-end">
            <div ref={car2Ref} className="absolute left-0 h-[85%] w-auto will-change-transform z-10 pl-2 pb-1">
                {racers[1] && (
                    <div className="relative h-full">
                        <img src={racers[1].image} className="h-full w-auto object-contain drop-shadow-2xl" />
                        <div className="absolute -top-2 left-2 bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-sm skew-x-[-10deg] shadow-lg whitespace-nowrap max-w-[200px] truncate">
                            {racers[1].name}
                        </div>
                    </div>
                )}
            </div>
          </div>
       </div>

       {/* =================================================================================
           CAPA 3: UI FLOTANTE (COUNTDOWN Y GANADOR)
       ================================================================================= */}
       
       {countdown && isRacing && (
           <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm">
               <h1 className="text-white font-black animate-ping drop-shadow-[0_0_10px_orange]" style={{ fontSize: '15vh' }}>{countdown}</h1>
           </div>
       )}
       
       {winner && isRacing && (
           <div className="absolute inset-0 bg-gradient-to-r from-orange-900/90 to-black/90 flex flex-col items-center justify-center z-50 animate-in fade-in duration-300">
               <h2 className="text-yellow-400 text-3xl font-black tracking-[0.5em] mb-4 drop-shadow-lg uppercase">Ganador</h2>
               <div className="bg-white text-black font-black px-12 py-4 text-6xl transform skew-x-[-15deg] border-4 border-orange-500 shadow-[0_0_60px_rgba(255,165,0,0.6)]">
                   {winner}
               </div>
               <p className="text-white mt-4 font-mono animate-pulse">Reiniciando sistema...</p>
           </div>
       )}
    </div>
  );
}