'use client';

/**
 * The demo (DemoStage), loaded in the browser only: it needs the page, and its
 * code (GTK-JS) loads on its own, after the rest of the page is ready. Until
 * it's drawn, the page is marked as waiting for it (globals.css).
 */
import dynamic from 'next/dynamic';
import { DemoPending } from './DemoPending';

export default dynamic(() => import('./DemoStage'), { ssr: false, loading: DemoPending });
