'use client';

/** MediaWindow, in the browser only, as the homepage's demo is (DemoStageLoader). */
import dynamic from 'next/dynamic';

export default dynamic(() => import('./MediaWindow'), { ssr: false });
