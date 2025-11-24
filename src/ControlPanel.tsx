import { useState } from 'react';
import { db } from './firebase';
import { ref, push, set } from 'firebase/database';

export default function ControlPanel() {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('1');
  const [loading, setLoading] = useState(false);

  // Función para reducir la imagen a 158px de alto (el tamaño de tu pantalla ticker)
  const processImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          // Calculamos la escala para que mida 158px de alto
          const scale = 158 / img.height; 
          canvas.height = 158;
          canvas.width = img.width * scale;
          
          const ctx = canvas.getContext('2d');
          if(ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Convertimos a texto (Base64) para enviar por internet
          resolve(canvas.toDataURL('image/png'));
        };
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileInput = (document.getElementById('carPhoto') as HTMLInputElement).files?.[0];
    
    if (!name || !fileInput) return alert("¡Faltan datos o foto!");

    setLoading(true);
    
    // 1. Procesar imagen
    const imageBase64 = await processImage(fileInput);

    // 2. Enviar a Firebase (Sala de espera)
    const newCarRef = push(ref(db, 'waiting_room'));
    await set(newCarRef, {
      name,
      level,
      image: imageBase64,
      timestamp: Date.now()
    });

    setLoading(false);
    alert("¡Auto enviado al taller! Esperando carrera...");
    setName(''); // Limpiar formulario
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4 flex flex-col items-center justify-center font-sans">
      <h1 className="text-3xl font-black text-orange-600 mb-6 italic">TALLER RACING</h1>
      
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-xl">
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Piloto</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full mt-1 p-3 bg-black/50 rounded-lg border border-gray-600 text-white font-bold focus:border-orange-500 outline-none"
            placeholder="Tu nombre..."
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Motor (Nivel)</label>
          <select 
            value={level} onChange={(e) => setLevel(e.target.value)}
            className="w-full mt-1 p-3 bg-black/50 rounded-lg border border-gray-600 text-white outline-none"
          >
            <option value="1">Nivel 1 (Novato)</option>
            <option value="2">Nivel 2 (Callejero)</option>
            <option value="3">Nivel 3 (Profesional)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Foto</label>
          <input type="file" id="carPhoto" accept="image/*" 
            className="w-full mt-1 text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-orange-600 file:text-white"
          />
        </div>

        <button 
          disabled={loading}
          className={`w-full py-4 rounded-lg font-black text-lg shadow-lg mt-4 ${loading ? 'bg-gray-600' : 'bg-gradient-to-r from-orange-600 to-red-600 hover:scale-105 transition-transform'}`}
        >
          {loading ? 'SUBIENDO...' : 'ENVIAR A PISTA 🏁'}
        </button>
      </form>
    </div>
  );
}