import { useEffect, useState, useRef } from 'react';
import { db } from './firebase';
import { ref, onValue, remove } from 'firebase/database';
import { QRCodeSVG } from 'qrcode.react'; // Importamos el QR

type Car = { id: string; name: string; image: string; level: string; };

export default function RaceTrack() {
  const [racers, setRacers] = useState<Car[]>([]);
  const [isRacing, setIsRacing] = useState(false);
  
  // ESTADOS PARA "MEJOR DE 3"
  const [scores, setScores] = useState({ p1: 0, p2: 0 }); // Marcador
  const [round, setRound] = useState(1); // Ronda actual
  
  const [winner, setWinner] = useState<string | null>(null); // Ganador de la ronda
  const [seriesWinner, setSeriesWinner] = useState<string | null>(null); // Ganador TOTAL
  const [countdown, setCountdown] = useState<string | null>(null);
  
  const car1Ref = useRef<HTMLDivElement>(null);
  const car2Ref = useRef<HTMLDivElement>(null);
  const car1Pos = useRef(0);
  const car2Pos = useRef(0);
  const raceLoop = useRef<number>();

  // 1. ESCUCHAR FIREBASE
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

  // 2. INICIAR LA SERIE (Sets de carreras)
  const startSeries = async (carA: Car, carB: Car) => {
    setIsRacing(true);
    // Borramos de Firebase
    remove(ref(db, `waiting_room/${carA.id}`)).catch(() => {});
    remove(ref(db, `waiting_room/${carB.id}`)).catch(() => {});

    setRacers([carA, carB]);
    setScores({ p1: 0, p2: 0 }); // Reiniciar marcador
    setRound(1);
    setSeriesWinner(null);
    
    startRound(carA, carB); // Iniciar primera carrera
  };

  // 3. PREPARAR UNA RONDA INDIVIDUAL
  const startRound = (carA: Car, carB: Car) => {
    car1Pos.current = 0;
    car2Pos.current = 0;
    setWinner(null);

    // Reseteamos visualmente los autos
    if (car1Ref.current) car1Ref.current.style.transform = `translateX(0vw)`;
    if (car2Ref.current) car2Ref.current.style.transform = `translateX(0vw)`;

    let count = 3;
    setCountdown(`RONDA ${round}`); // Anunciar ronda
    
    // Secuencia: Texto Ronda -> 3 -> 2 -> 1 -> GO
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
    }, 1500); // 1.5s para leer "RONDA X"
  };

  // 4. MOTOR DE FÍSICA
  const runEngine = (carA: Car, carB: Car) => {
    const levelA = parseInt(carA.level);
    const levelB = parseInt(carB.level);
    
    // Lógica Rápido y Furioso (Probabilidad por nivel)
    let winnerIndex = -1; 
    if (levelA > levelB) winnerIndex = Math.random() < 0.9 ? 0 : 1;
    else if (levelB > levelA) winnerIndex = Math.random() < 0.9 ? 1 : 0;
    else winnerIndex = Math.random() < 0.5 ? 0 : 1;

    let speedA = 0.35 + Math.random() * 0.2;
    let speedB = 0.35 + Math.random() * 0.2;

    if (winnerIndex === 0) speedA += 0.18;
    else speedB += 0.18;

    const animate = () => {
      if (!car1Ref.current || !car2Ref.current) return;

      car1Pos.current += speedA;
      car2Pos.current += speedB;

      car1Ref.current.style.transform = `translateX(${car1Pos.current}vw)`;
      car2Ref.current.style.transform = `translateX(${car2Pos.current}vw)`;

      // Meta al 85vw
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

  // 5. MANEJAR FIN DE RONDA
  const handleRoundEnd = (winnerName: string, winnerIndex: number) => {
    setWinner(winnerName);
    
    // Actualizar puntajes
    const newScores = { ...scores };
    if (winnerIndex === 0) newScores.p1 += 1;
    else newScores.p2 += 1;
    setScores(newScores);

    // LÓGICA DE SERIE: ¿Alguien llegó a 2 victorias?
    setTimeout(() => {
        if (newScores.p1 >= 2 || newScores.p2 >= 2) {
            // FIN DE LA SERIE
            setSeriesWinner(winnerName);
            setTimeout(() => {
                setIsRacing(false); // Volver al lobby
                setRacers([]);
            }, 8000); // 8 segundos para celebrar al campeón
        } else {
            // SIGUIENTE RONDA
            setRound(prev => prev + 1);
            startRound(racers[0], racers[1]);
        }
    }, 3000); // 3 seg mostrando ganador de ronda
  };

  // --- VISTA: LOBBY (Sala de espera) ---
  if (!isRacing) {
    const p1 = racers[0];
    const qrUrl = "https://autos-plum.vercel.app/"; // TU URL REAL

    return (
      <div className="w-screen h-screen bg-black flex justify-between items-center border-y-4 border-orange-600 px-4 overflow-hidden relative font-sans">
         {/* Fondo */}
         <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>

         {/* JUGADOR 1 (Izquierda - 35%) */}
         <div className="z-10 w-[35%] h-[90%] flex items-center bg-gray-900 border border-orange-500 rounded-lg p-2 gap-2 shadow-lg overflow-hidden">
            {p1 ? (
              <>
                <img src={p1.image} className="h-full w-auto max-w-[50%] object-contain bg-black/50 rounded flex-shrink-0" />
                <div className="flex flex-col justify-center h-full min-w-0">
                   <span className="text-orange-500 font-bold text-[10px] uppercase tracking-widest leading-none mb-1">Retador</span>
                   <h1 className="text-white font-black text-xl uppercase leading-none truncate">{p1.name}</h1>
                   <span className="text-gray-400 font-mono text-xs mt-1">NIVEL {p1.level}</span>
                </div>
              </>
            ) : (
               <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold animate-pulse text-lg">ESPERANDO JUGADOR 1</div>
            )}
         </div>

         {/* CENTRO: QR CODE (20%) */}
         <div className="z-10 flex flex-col items-center justify-center bg-white p-2 rounded-lg shadow-[0_0_15px_rgba(255,165,0,0.5)]">
            <QRCodeSVG value={qrUrl} size={100} />
            <p className="text-black text-[10px] font-bold mt-1 uppercase text-center leading-tight">¡Escanea para<br/>competir!</p>
         </div>

         {/* JUGADOR 2 (Derecha - 35%) */}
         <div className="z-10 w-[35%] h-[90%] flex items-center justify-center border-2 border-gray-800 border-dashed rounded-lg bg-gray-900/30">
            <div className="text-gray-600 font-bold animate-pulse text-lg tracking-widest text-center px-2">ESPERANDO RIVAL</div>
         </div>
      </div>
    );
  }

  // --- VISTA: CARRERA (Racing Mode) ---
  return (
    <div className="relative w-screen h-screen bg-neutral-900 overflow-hidden border-y-4 border-orange-600 flex flex-col">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,_#333_1px,_transparent_1px)] [background-size:20px_20px]"></div>

      {/* MARCADOR CENTRAL (Flotante) */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0 opacity-30 text-[10vh] font-black text-white flex gap-10">
        <span>{scores.p1}</span>
        <span>-</span>
        <span>{scores.p2}</span>
      </div>

      {/* CARRIL 1 (P1) */}
      <div className="relative h-1/2 w-full border-b border-dashed border-gray-600 flex items-end">
        <div ref={car1Ref} className="absolute left-0 h-[85%] w-auto will-change-transform z-10 pl-2 pb-1">
           <img src={racers[0].image} className="h-full w-auto object-contain drop-shadow-2xl" />
           <div className="absolute -top-1 left-2 bg-orange-600/90 text-white text-[10px] font-bold px-2 rounded-sm skew-x-[-10deg] whitespace-nowrap overflow-hidden max-w-[150px] truncate">
             {racers[0].name} {scores.p1 === 1 && '★'}
           </div>
        </div>
      </div>

      {/* CARRIL 2 (P2) */}
      <div className="relative h-1/2 w-full flex items-end">
        <div ref={car2Ref} className="absolute left-0 h-[85%] w-auto will-change-transform z-10 pl-2 pb-1">
           <img src={racers[1].image} className="h-full w-auto object-contain drop-shadow-2xl" />
           <div className="absolute -top-1 left-2 bg-blue-600/90 text-white text-[10px] font-bold px-2 rounded-sm skew-x-[-10deg] whitespace-nowrap overflow-hidden max-w-[150px] truncate">
             {racers[1].name} {scores.p2 === 1 && '★'}
           </div>
        </div>
      </div>

      {/* META */}
      <div className="absolute right-[15%] top-0 bottom-0 w-8 bg-[repeating-linear-gradient(45deg,#fff,#fff_10px,#000_10px,#000_20px)] opacity-60 z-0"></div>

      {/* MENSAJES FLOTANTES */}
      {countdown && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <h1 className="text-orange-500 font-black animate-ping drop-shadow-md text-center leading-none" style={{ fontSize: '10vh' }}>
            {countdown}
          </h1>
        </div>
      )}

      {/* GANADOR DE RONDA */}
      {winner && !seriesWinner && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
          <h2 className="text-white text-lg font-bold tracking-widest uppercase">Ganador Ronda {round}</h2>
          <div className="text-orange-500 font-black text-6xl transform -rotate-2">
            {winner}
          </div>
          <div className="text-gray-300 mt-2 text-sm font-mono">Siguiente carrera en breve...</div>
        </div>
      )}

      {/* GRAN CAMPEÓN (SERIES WINNER) */}
      {seriesWinner && (
        <div className="absolute inset-0 bg-gradient-to-r from-orange-900 to-black flex flex-col items-center justify-center z-50 animate-pulse">
            <h2 className="text-yellow-400 text-2xl font-black tracking-[0.5em] mb-2 drop-shadow-lg">REY DE LA PISTA</h2>
            <div className="bg-white text-black font-black px-8 py-2 text-5xl transform skew-x-[-15deg] border-4 border-orange-500 shadow-[0_0_50px_rgba(255,165,0,0.8)]">
                {seriesWinner}
            </div>
            <p className="text-white mt-4 font-mono text-sm">VICTORIA FINAL {Math.max(scores.p1, scores.p2)} - {Math.min(scores.p1, scores.p2)}</p>
        </div>
      )}
    </div>
  );
}