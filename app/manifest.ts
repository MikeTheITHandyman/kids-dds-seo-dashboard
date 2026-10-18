import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kids DDS SEO & AI Visibility',
    short_name: 'Kids DDS SEO',
    description: 'SEO Rankings, Google Analytics, and AI Visibility Tracker for Kids Dentist Grayslake',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#6B4BC8',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon?size=192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon?size=512',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
