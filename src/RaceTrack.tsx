import { useEffect, useState, useRef } from 'react';
import { db } from './firebase';
import { ref, onValue, remove } from 'firebase/database';

type Car = { id: string; name: string; image: string; level: string; };

export default function RaceTrack() {
  const [racers, setRacers] = useState<Car[]>([]);
  const [isRacing, setIsRacing] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
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
          startSequence(carList[0], carList[1]);
        }
      } else {
        setRacers([]);
      }
    });
    return () => unsubscribe();
  }, [isRacing]);

  // 2. SECUENCIA
  const startSequence = async (carA: Car, carB: Car) => {
    setIsRacing(true);
    remove(ref(db, `waiting_room/${carA.id}`)).catch(() => {});
    remove(ref(db, `waiting_room/${carB.id}`)).catch(() => {});

    setRacers([carA, carB]);
    car1Pos.current = 0;
    car2Pos.current = 0;
    setWinner(null);

    let count = 3;
    setCountdown("3");
    
    const timer = setInterval(() => {
      count--;
      if (count > 0) setCountdown(String(count));
      else if (count === 0) setCountdown("GO!");
      else {
        clearInterval(timer);
        setCountdown(null);
        startEngine(carA, carB);
      }
    }, 1000);
  };

  // 3. MOTOR
  const startEngine = (carA: Car, carB: Car) => {
    const levelA = parseInt(carA.level);
    const levelB = parseInt(carB.level);
    
    let winnerIndex = -1; 
    if (levelA > levelB) winnerIndex = Math.random() < 0.9 ? 0 : 1;
    else if (levelB > levelA) winnerIndex = Math.random() < 0.9 ? 1 : 0;
    else winnerIndex = Math.random() < 0.5 ? 0 : 1;

    let speedA = 0.3 + Math.random() * 0.2;
    let speedB = 0.3 + Math.random() * 0.2;

    if (winnerIndex === 0) speedA += 0.15;
    else speedB += 0.15;

    const animate = () => {
      if (!car1Ref.current || !car2Ref.current) return;

      car1Pos.current += speedA;
      car2Pos.current += speedB;

      car1Ref.current.style.transform = `translateX(${car1Pos.current}vw)`;
      car2Ref.current.style.transform = `translateX(${car2Pos.current}vw)`;

      if (car1Pos.current >= 85 || car2Pos.current >= 85) {
        const wName = car1Pos.current > car2Pos.current ? carA.name : carB.name;
        setWinner(wName);
        cancelAnimationFrame(raceLoop.current!);
        
        setTimeout(() => {
          setIsRacing(false);
          setRacers([]);
        }, 6000);
      } else {
        raceLoop.current = requestAnimationFrame(animate);
      }
    };
    raceLoop.current = requestAnimationFrame(animate);
  };

  // --- VISTA: LOBBY (Tarjeta de espera) ---
  if (!isRacing) {
    const p1 = racers[0];
    return (
      <div className="w-screen h-screen bg-black flex justify-between items-center border-y-4 border-orange-600 px-8 overflow-hidden relative font-sans">
         <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>

         {/* IZQUIERDA: TARJETA JUGADOR 1 */}
         <div className="z-10 w-[40%] h-[90%] flex items-center bg-gray-900 border border-orange-500 rounded-lg p-2 gap-4">
            {p1 ? (
              <>
                {/* Foto a la IZQUIERDA (Para aprovechar ancho) */}
                <img src={p1.image} className="h-full w-auto object-contain bg-black/50 rounded" />
                
                {/* Texto a la DERECHA */}
                <div className="flex flex-col justify-center h-full">
                   <span className="text-orange-500 font-bold text-xs uppercase tracking-widest">Listo para correr</span>
                   <h1 className="text-white font-black text-2xl uppercase leading-none">{p1.name}</h1>
                   <span className="text-gray-400 font-mono text-sm">MOTOR NIVEL {p1.level}</span>
                </div>
              </>
            ) : (
              <div className="w-full text-center text-gray-500 font-bold animate-pulse text-xl">ESPERANDO JUGADOR 1...</div>
            )}
         </div>

         {/* CENTRO: VS */}
         <div className="z-10 flex flex-col items-center justify-center">
            <h1 className="text-white font-black italic tracking-tighter text-4xl">VS</h1>
         </div>

         {/* DERECHA: TARJETA VACÍA JUGADOR 2 */}
         <div className="z-10 w-[40%] h-[90%] flex items-center justify-center border-2 border-gray-800 border-dashed rounded-lg bg-gray-900/30">
            <div className="text-gray-600 font-bold animate-pulse text-lg tracking-widest">ESPERANDO RIVAL...</div>
         </div>
      </div>
    );
  }

  // --- VISTA: CARRERA ---
  return (
    <div className="relative w-screen h-screen bg-neutral-900 overflow-hidden border-y-4 border-orange-600 flex flex-col">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,_#333_1px,_transparent_1px)] [background-size:20px_20px]"></div>

      {/* CARRIL 1 (50% Alto) */}
      <div className="relative h-1/2 w-full border-b border-dashed border-gray-600 flex items-end">
        {/* Contenedor Carro 1 */}
        <div ref={car1Ref} className="absolute left-0 h-[90%] w-auto will-change-transform z-10 pl-2 pb-1">
           {/* Imagen ajustada a la altura del carril */}
           <img src={racers[0].image} className="h-full w-auto object-contain drop-shadow-lg" />
           {/* Etiqueta pequeña */}
           <div className="absolute top-0 left-2 bg-orange-600/80 text-white text-[10px] font-bold px-2 rounded-sm skew-x-[-10deg]">
             {racers[0].name}
           </div>
        </div>
      </div>

      {/* CARRIL 2 (50% Alto) */}
      <div className="relative h-1/2 w-full flex items-end">
        {/* Contenedor Carro 2 */}
        <div ref={car2Ref} className="absolute left-0 h-[90%] w-auto will-change-transform z-10 pl-2 pb-1">
           <img src={racers[1].image} className="h-full w-auto object-contain drop-shadow-lg" />
           <div className="absolute top-0 left-2 bg-blue-600/80 text-white text-[10px] font-bold px-2 rounded-sm skew-x-[-10deg]">
             {racers[1].name}
           </div>
        </div>
      </div>

      {/* META */}
      <div className="absolute right-[10%] top-0 bottom-0 w-8 bg-[repeating-linear-gradient(45deg,#fff,#fff_10px,#000_10px,#000_20px)] opacity-60 z-0"></div>

      {/* COUNTDOWN (Usando vh para que no se salga) */}
      {countdown && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <h1 className="text-orange-500 font-black animate-ping drop-shadow-md" style={{ fontSize: '15vh', lineHeight: '1' }}>
            {countdown}
          </h1>
        </div>
      )}

      {/* WINNER */}
      {winner && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
          <h2 className="text-white text-xl font-bold tracking-widest">GANADOR</h2>
          <div className="text-orange-500 font-black px-6 py-2 border-2 border-white transform -rotate-2" style={{ fontSize: '8vh' }}>
            {winner}
          </div>
        </div>
      )}
    </div>
  );
}