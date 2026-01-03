'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayChildren, setDisplayChildren] = useState(children);

  useEffect(() => {
    // Small delay before starting fade-out to let Next.js prepare
    const fadeOutTimer = setTimeout(() => {
      setIsAnimating(true);
    }, 50);

    // After fade-out, update children and fade in
    const fadeInTimer = setTimeout(() => {
      setDisplayChildren(children);
      setIsAnimating(false);
    }, 150);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(fadeInTimer);
    };
  }, [pathname, children]);

  return (
    <div
      className="transition-opacity duration-300 ease-in-out will-change-opacity"
      style={{
        opacity: isAnimating ? 0 : 1,
      }}
    >
      {displayChildren}
    </div>
  );
}

