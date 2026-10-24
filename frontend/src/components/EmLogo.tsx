import React, { useState } from 'react';

// Logo oficial de la empresa (frontend/public/logo.png, formato ancho ~2.7:1).
// Se dimensiona por altura y deja que el ancho siga la proporción natural.
// Si el archivo falta o falla, cae al cuadro de texto "E&M".
type EmLogoProps = {
  height?: number;
  radius?: number;
  alt?: string;
  style?: React.CSSProperties;
};

export const EmLogo = ({ height = 32, radius = 8, alt = 'E&M Electronic Solutions', style }: EmLogoProps) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        style={{
          height,
          width: height,
          borderRadius: radius,
          backgroundColor: 'var(--blue)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: height * 0.375,
          flexShrink: 0,
          ...style,
        }}
      >
        E&amp;M
      </div>
    );
  }

  return (
    <img
      src="/logo.png"
      alt={alt}
      onError={() => setFailed(true)}
      style={{
        height,
        width: 'auto',
        borderRadius: radius,
        objectFit: 'contain',
        flexShrink: 0,
        display: 'block',
        ...style,
      }}
    />
  );
};
