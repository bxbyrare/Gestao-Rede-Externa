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

  // 1. Motocicletas
  if (
    typeUpper.includes('MOTO') ||
    modelUpper.includes('MOTO') ||
    modelUpper.includes('CG') ||
    modelUpper.includes('TITAN') ||
    modelUpper.includes('FAN') ||
    modelUpper.includes('BROS') ||
    modelUpper.includes('BIZ') ||
    modelUpper.includes('FACTOR') ||
    modelUpper.includes('FAZER') ||
    modelUpper.includes('XRE')
  ) {
    return { src: '/vehicles/moto.png', alt: 'Motocicleta Operacional de Apoio' };
  }

  // 2. Caminhões Pesados / Cesto Aéreo / VUCs
  if (
    typeUpper.includes('CAMINH') ||
    modelUpper.includes('CAMINH') ||
    modelUpper.includes('ACCELO') ||
    modelUpper.includes('DELIVERY') ||
    modelUpper.includes('CARGO') ||
    modelUpper.includes('CONSTELLATION') ||
    modelUpper.includes('DAILY') ||
    modelUpper.includes('HR') ||
    modelUpper.includes('BONGO')
  ) {
    return { src: '/vehicles/caminhao.png', alt: 'Caminhão com Cesto Aéreo' };
  }

  // 3. Vans e Furgões Grandes
  if (
    typeUpper.includes('VAN') ||
    modelUpper.includes('DUCATO') ||
    modelUpper.includes('MASTER') ||
    modelUpper.includes('SPRINTER') ||
    modelUpper.includes('BOXER') ||
    modelUpper.includes('JUMPER') ||
    modelUpper.includes('EXPERT') ||
    modelUpper.includes('TRANSIT')
  ) {
    return { src: '/vehicles/van.png', alt: 'Van Furgão Operacional' };
  }

  // 4. Picapes Médias / 4x4 (S10, Hilux, Ranger, Amarok, Frontier, L200, Titano)
  if (
    modelUpper.includes('S10') ||
    modelUpper.includes('S-10') ||
    modelUpper.includes('HILUX') ||
    modelUpper.includes('RANGER') ||
    modelUpper.includes('AMAROK') ||
    modelUpper.includes('FRONTIER') ||
    modelUpper.includes('L200') ||
    modelUpper.includes('TITANO') ||
    modelUpper.includes('RAMPAGE')
  ) {
    return { src: '/vehicles/s10.png', alt: 'Picape Cabine Dupla 4x4 de Operação' };
  }

  // 5. Picapes Leves / Utilitárias com Caçamba (Strada, Saveiro, Toro, Montana, Oroch)
  if (
    modelUpper.includes('STRADA') ||
    modelUpper.includes('SAVEIRO') ||
    modelUpper.includes('TORO') ||
    modelUpper.includes('MONTANA') ||
    modelUpper.includes('OROCH') ||
    typeUpper.includes('PICAPE') ||
    typeUpper.includes('CAMINHONETE')
  ) {
    return { src: '/vehicles/strada.png', alt: 'Picape Utilitária com Rack de Escada' };
  }

  // 6. Furgões Leves Compactos
  if (
    modelUpper.includes('FIORINO') ||
    modelUpper.includes('FURGAO') ||
    modelUpper.includes('KANGOO') ||
    modelUpper.includes('PARTNER') ||
    modelUpper.includes('DOBLO') ||
    modelUpper.includes('BERLINGO') ||
    typeUpper.includes('FURGÃO')
  ) {
    return { src: '/vehicles/fiorino.png', alt: 'Fiat Fiorino Furgão Operacional' };
  }

  // 7. Hatchbacks Compactos de Serviço
  if (
    modelUpper.includes('KWID') ||
    modelUpper.includes('MOBI') ||
    modelUpper.includes('UP') ||
    modelUpper.includes('CLIO') ||
    modelUpper.includes('C3')
  ) {
    return { src: '/vehicles/kwid.png', alt: 'Hatchback Compacto de Apoio' };
  }

  // 8. Padrão: Gol / Polo / Onix / Argo / Passeio
  return { src: '/vehicles/gol.png', alt: 'Veículo Operacional de Passeio e Suporte' };
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
  const specs = [
    hasRack && 'Rack Escada',
    hasGiroflex && 'Giroflex',
    hasBasket && 'Cesto Aéreo',
    hasInverter && 'Inversor',
  ].filter(Boolean) as string[];

  return (
    <div
      className={`relative w-full h-36 rounded-2xl overflow-hidden bg-[#06080d]/90 border border-white/[0.07] flex flex-col justify-between p-3 group/preview transition-colors duration-300 hover:border-white/[0.14] ${className}`}
    >
      {/* Subtle Studio Overhead Keylight */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,rgba(255,255,255,0.05),transparent_78%)] pointer-events-none" />

      {/* Top Minimalist Eyebrow */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-neutral-400 truncate">
          {model || type}
        </span>
        <span className="text-[10px] font-medium text-neutral-500 shrink-0">
          {type || 'Operacional'}
        </span>
      </div>

      {/* Center Photorealistic Showcase */}
      <div className="relative z-10 flex-1 flex items-center justify-center overflow-hidden [mask-image:radial-gradient(ellipse_94%_90%_at_50%_50%,black_65%,transparent_100%)]">
        <img
          src={vehicle.src}
          alt={vehicle.alt}
          className="w-full h-full object-contain max-h-24 filter drop-shadow-[0_10px_16px_rgba(0,0,0,0.85)] transform group-hover/preview:scale-[1.03] transition-transform duration-300 ease-out"
          loading="lazy"
        />
      </div>

      {/* Subtle Monochrome Equipment Line */}
      {specs.length > 0 && (
        <div className="relative z-10 flex items-center justify-center text-[10px] font-medium text-neutral-400 border-t border-white/[0.05] pt-1.5 truncate">
          {specs.join(' · ')}
        </div>
      )}
    </div>
  );
}
