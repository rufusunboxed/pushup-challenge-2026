// Profile color utilities
// Maps color names to hex codes and Tailwind classes

export const PROFILE_COLOR_HEX: Record<string, string> = {
  'midnight-navy': '#1E3A8A',
  'forest-green': '#14532D',
  'crimson-red': '#991B1B',
  'royal-amethyst': '#581C87',
  'deep-teal': '#134E4A',
  'burnt-sienna': '#9A3412',
  'classic-cobalt': '#2563EB',
  'dark-magenta': '#86198F',
  'goldenrod': '#A16207',
  'slate-gray': '#334155',
  'bordeaux': '#701A75',
  'ocean-blue': '#0369A1',
  'olive-drab': '#3F6212',
  'electric-indigo': '#4338CA',
  'spiced-pumpkin': '#C2410C',
  'peacock-blue': '#0E7490',
  'blackberry': '#4C1D95',
  'rosewood': '#BE123C',
  'dark-moss': '#166534',
  'charcoal-blue': '#1E293B',
};

// Convert hex to RGB
export const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '34, 197, 94'; // Default to green
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
};

// Get RGB for glow effects
export const getGlowColor = (colorName: string): string => {
  const hex = PROFILE_COLOR_HEX[colorName] || PROFILE_COLOR_HEX['midnight-navy'];
  return hexToRgb(hex);
};

// Map to closest Tailwind classes for heatmaps (using similar colors)
export const PROFILE_COLOR_TAILWIND: Record<string, string> = {
  'midnight-navy': 'bg-blue-800',
  'forest-green': 'bg-green-800',
  'crimson-red': 'bg-red-800',
  'royal-amethyst': 'bg-purple-800',
  'deep-teal': 'bg-teal-800',
  'burnt-sienna': 'bg-orange-800',
  'classic-cobalt': 'bg-blue-600',
  'dark-magenta': 'bg-purple-700',
  'goldenrod': 'bg-yellow-700',
  'slate-gray': 'bg-slate-600',
  'bordeaux': 'bg-purple-900',
  'ocean-blue': 'bg-blue-700',
  'olive-drab': 'bg-green-700',
  'electric-indigo': 'bg-indigo-700',
  'spiced-pumpkin': 'bg-orange-700',
  'peacock-blue': 'bg-cyan-700',
  'blackberry': 'bg-purple-900',
  'rosewood': 'bg-rose-700',
  'dark-moss': 'bg-green-800',
  'charcoal-blue': 'bg-slate-800',
};
