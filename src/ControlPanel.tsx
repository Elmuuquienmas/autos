import { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref, push, set, onValue, update } from 'firebase/database';

export default function ControlPanel() {
  // --- ESTADOS ---
  const [myCarId, setMyCarId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [flipImage, setFlipImage] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- JUEGO ---
  const [gameMode, setGameMode] = useState<'FORM' | 'RACING' | 'BOOSTING'>('FORM');
  const [myRole, setMyRole] = useState<'p1' | 'p2' | null>(null);
  const [boostClicks, setBoostClicks] = useState(0);

  // LOGICA: Escuchar carrera
  useEffect(() => {
    if (!myCarId) return;
    const activeRaceRef = ref(db, 'active_race');
    const unsubscribe = onValue(activeRaceRef, (snapshot) => {
      const race = snapshot.val();
      if (!race || (race.p1?.id !== myCarId && race.p2?.id !== myCarId)) {
        if (gameMode !== 'FORM') resetForm();
        return;
      }
      const role = race.p1?.id === myCarId ? 'p1' : 'p2';
      setMyRole(role);
      setGameMode(race.status === 'PIT_STOP' ? 'BOOSTING' : 'RACING');
    });
    return () => unsubscribe();
  }, [myCarId, gameMode]);

  const handleBoostClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    if (gameMode === 'BOOSTING' && myRole) {
       const newClicks = boostClicks + 1;
       setBoostClicks(newClicks);
       update(ref(db, `active_race/${myRole}`), { sessionClicks: newClicks });
    }
  };

  const resetForm = () => {
    setMyCarId(null); setName(''); setSelectedFile(null);
    setPreview(null); setFlipImage(false); setGameMode('FORM'); setBoostClicks(0); setMyRole(null);
  };

  // LOGICA: Imagen
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const processImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scale = MAX_WIDTH / img.width; 
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if(ctx) {
          ctx.save();
          if (flipImage) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        resolve(canvas.toDataURL('image/png', 0.8));
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedFile) return alert("Faltan datos");
    setLoading(true);
    try {
      const imageBase64 = await processImage(selectedFile);
      const waitingRef = ref(db, 'waiting_room');
      const newCarRef = push(waitingRef);
      const newId = newCarRef.key; 
      setMyCarId(newId);

      await set(newCarRef, {
        id: newId,
        name: name.toUpperCase().substring(0, 12),
        level: '1', 
        clicks: 0,
        image: imageBase64,
        timestamp: Date.now()
      });
    } catch (error) { console.error(error); setLoading(false); }
  };

  // --- VISTAS FULL SCREEN ---

  // 1. MODO BOOST (PANTALLA COMPLETA ROJA)
  if (gameMode === 'BOOSTING') {
    return (
      <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center touch-none select-none overflow-hidden"
           onMouseDown={handleBoostClick} onTouchStart={handleBoostClick}>
         <h2 className="text-yellow-300 font-black text-[8vw] animate-bounce mb-4 uppercase text-center px-2 leading-none">
           ¡TURBO BOOST!
         </h2>
         <p className="text-white font-bold text-lg mb-8 animate-pulse">PICA LA PANTALLA RÁPIDO</p>
         <div className="bg-white text-red-600 rounded-full w-[50vw] h-[50vw] max-w-[250px] max-h-[250px] flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.5)] active:scale-90 transition-transform">
            <span className="text-[15vw] font-black">{boostClicks}</span>
         </div>
      </div>
    );
  }

  // 2. MODO ESPECTADOR
  if (gameMode === 'RACING') {
    return (
      <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col items-center justify-center p-6 text-center">
         <div className="text-8xl mb-6 animate-pulse">👀</div>
         <h1 className="text-orange-500 font-black text-4xl mb-4">CORRIENDO</h1>
         <p className="text-white text-xl">Mira la pantalla grande</p>
         <div className="mt-10 py-2 px-6 bg-gray-800 rounded-full text-gray-400 font-mono text-xs">
            ID: {myCarId?.slice(-4)}
         </div>
      </div>
    );
  }

  // 3. FORMULARIO (MODO APP NATIVA)
  return (
    <div className="fixed inset-0 bg-neutral-900 flex flex-col w-full h-full font-sans">
      
      {/* HEADER FIJO */}
      <div className="flex-none bg-neutral-900 p-4 pb-2 text-center border-b border-gray-800 z-10 shadow-md">
        <h1 className="text-3xl font-black text-orange-600 italic tracking-tighter transform -skew-x-6">
          TALLER RACING
        </h1>
      </div>

      {/* CUERPO SCROLLEABLE (ocupa el espacio sobrante) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 flex flex-col gap-6 w-full max-w-lg mx-auto">
        
        {/* INPUT NOMBRE */}
        <div className="w-full">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">NOMBRE PILOTO</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-4 bg-neutral-800 rounded-xl text-white font-bold text-xl outline-none border-2 border-transparent focus:border-orange-600 transition-colors placeholder-gray-600"
            placeholder="Escribe aquí..."
            maxLength={12}
          />
        </div>

        {/* INPUT FOTO */}
        <div className="w-full flex-1 flex flex-col">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">FOTO VEHÍCULO</label>
          
          {!preview ? (
            <label className="flex-1 min-h-[200px] flex flex-col items-center justify-center w-full border-2 border-neutral-700 border-dashed rounded-xl bg-neutral-800/50 hover:bg-neutral-800 transition-colors active:scale-[0.98]">
               <span className="text-4xl mb-2">📸</span>
               <span className="text-sm text-gray-400 font-bold uppercase">Tocar para subir</span>
               <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div className="w-full flex flex-col gap-3">
               <div className="relative w-full h-[250px] bg-black/40 rounded-xl overflow-hidden border border-neutral-700">
                  <img src={preview} className={`w-full h-full object-contain transition-transform duration-300 ${flipImage ? 'scale-x-[-1]' : ''}`} />
                  <button 
                    onClick={() => { setSelectedFile(null); setPreview(null); }}
                    className="absolute top-2 right-2 bg-red-600/80 text-white rounded-full w-8 h-8 font-bold flex items-center justify-center z-20">✕</button>
               </div>
               <button 
                  type="button" 
                  onClick={() => setFlipImage(!flipImage)} 
                  className="w-full py-4 bg-neutral-800 rounded-xl font-bold text-gray-300 border border-neutral-700 active:bg-neutral-700 flex items-center justify-center gap-2">
                  🔄 Voltear Dirección
               </button>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER FIJO (Siempre visible abajo) */}
      <div className="flex-none p-5 bg-neutral-900 border-t border-gray-800 w-full max-w-lg mx-auto z-20">
        <button 
          onClick={handleSubmit}
          disabled={loading || !name || !selectedFile}
          className={`w-full py-5 rounded-2xl font-black text-xl tracking-wide shadow-lg transition-all ${loading || !name || !selectedFile ? 'bg-neutral-800 text-gray-600' : 'bg-gradient-to-r from-orange-600 to-red-600 text-white active:scale-[0.98]'}`}
        >
          {loading ? 'CONECTANDO...' : 'ENTRAR A PISTA 🏁'}
        </button>
      </div>

    </div>
  );
}