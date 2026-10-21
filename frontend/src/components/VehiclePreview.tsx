interface VehiclePreviewProps {
  type: string;
  model: string;
  hasRack?: boolean;
  hasBasket?: boolean;
  hasGiroflex?: boolean;
  hasInverter?: boolean;
  plate?: string;
  className?: string;
}

function getVehicleImage(model: string, type: string): { src: string; alt: string } {
  const modelUpper = (model || '').toUpperCase();
  const typeUpper = (type || '').toUpperCase();

  if (typeUpper.includes('MOTO') || modelUpper.includes('MOTO') || modelUpper.includes('CG')) {
    return { src: '/vehicles/moto.png', alt: 'Motocicleta Operacional' };
  }
  if (
    typeUpper.includes('CAMINH') ||
    modelUpper.includes('CAMINH') ||
    modelUpper.includes('HR') ||
    modelUpper.includes('DAILY') ||
    modelUpper.includes('ACCELO')
  ) {
    return { src: '/vehicles/caminhao.png', alt: 'Caminhão com Cesto Aéreo' };
  }
  if (
    typeUpper.includes('VAN') ||
    modelUpper.includes('DUCATO') ||
    modelUpper.includes('MASTER') ||
    modelUpper.includes('SPRINTER') ||
    modelUpper.includes('BOXER')
  ) {
    return { src: '/vehicles/van.png', alt: 'Van Furgão Operacional' };
  }
  if (
    modelUpper.includes('STRADA') ||
    modelUpper.includes('SAVEIRO') ||
    modelUpper.includes('TORO') ||
    modelUpper.includes('HILUX') ||
    modelUpper.includes('MONTANA')
  ) {
    return { src: '/vehicles/strada.png', alt: 'Picape Utilitária com Rack' };
  }
  if (
    modelUpper.includes('FIORINO') ||
    modelUpper.includes('FURGAO') ||
    modelUpper.includes('KANGOO') ||
    modelUpper.includes('PARTNER') ||
    modelUpper.includes('DOBLO')
  ) {
    return { src: '/vehicles/fiorino.png', alt: 'Fiat Fiorino Furgão' };
  }
  if (modelUpper.includes('KWID') || modelUpper.includes('MOBI')) {
    return { src: '/vehicles/kwid.png', alt: 'Hatchback Compacto de Apoio' };
  }

  // Default: Gol / Polo / Onix / Argo / Passeio
  return { src: '/vehicles/gol.png', alt: 'Veículo Operacional Hatchback' };
}

export default function VehiclePreview({
  type = 'Utilitário',
  model = '',
  hasRack = false,
  hasBasket = false,
  hasGiroflex = false,
  hasInverter = false,
  className = '',
}: VehiclePreviewProps) {
  const vehicle = getVehicleImage(model, type);

  return (
    <div
      className={`relative w-full h-44 rounded-2xl overflow-hidden bg-gradient-to-b from-[#141B29] via-[#0E131F] to-[#080B12] border border-white/10 flex flex-col justify-between p-3.5 group/preview transition-all duration-300 hover:border-red-500/30 shadow-xl ${className}`}
    >
      {/* Studio Lighting Highlights */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.06] via-transparent to-transparent pointer-events-none" />
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-12 bg-black/60 blur-xl pointer-events-none" />

      {/* Top Floating Badges */}
      <div className="relative z-10 flex items-center justify-between gap-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-900/80 text-white/90 border border-white/10 backdrop-blur-md shadow-sm">
          {model || type}
        </span>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {hasRack && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold text-amber-300 flex items-center gap-1 shadow-sm backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Rack Escada
            </span>
          )}
          {hasGiroflex && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[9px] font-bold text-amber-300 animate-pulse flex items-center gap-1 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_#f59e0b]" />
              Giroflex
            </span>
          )}
          {hasBasket && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold text-emerald-300 flex items-center gap-1 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Cesto Aéreo
            </span>
          )}
          {hasInverter && (
            <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-[9px] font-bold text-cyan-300 flex items-center gap-1 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Inversor
            </span>
          )}
        </div>
      </div>

      {/* Center Photorealistic Studio Automotive Showcase */}
      <div className="relative z-10 flex-1 flex items-center justify-center my-1 overflow-hidden">
        <img
          src={vehicle.src}
          alt={vehicle.alt}
          className="w-full h-full object-contain max-h-32 drop-shadow-[0_12px_20px_rgba(0,0,0,0.85)] transform group-hover/preview:scale-[1.04] transition-transform duration-300 ease-out"
          loading="lazy"
        />
      </div>

      {/* Bottom Status Bar */}
      <div className="relative z-10 flex items-center justify-between text-[10px] text-slate-400 border-t border-white/5 pt-1.5">
        <span className="font-semibold text-slate-300">{type || 'Frota Operacional'}</span>
        <span className="text-emerald-400 font-bold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          Ativo na Operação
        </span>
      </div>
    </div>
  );
}
