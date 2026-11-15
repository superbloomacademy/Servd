import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Servd', short_name: 'Servd', start_url: '/staff', display: 'standalone',
    background_color: '#ffffff', theme_color: '#ffffff', description: 'Seat and table ordering for theaters, restaurants and cafés.',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
