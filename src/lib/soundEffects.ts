// Web Audio API utilities for sound feedback

const SOUNDS_ENABLED_KEY = 'bulkTransfer_soundsEnabled';

/**
 * Check if sounds are enabled in localStorage
 */
export function areSoundsEnabled(): boolean {
  const stored = localStorage.getItem(SOUNDS_ENABLED_KEY);
  return stored !== 'false'; // Default to true
}

/**
 * Toggle sound effects on/off
 */
export function toggleSounds(): boolean {
  const current = areSoundsEnabled();
  localStorage.setItem(SOUNDS_ENABLED_KEY, String(!current));
  return !current;
}

// Reuse a single AudioContext to avoid memory leaks
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a beep sound using Web Audio API
 */
function playBeep(frequency: number, duration: number, volume: number = 0.3) {
  if (!areSoundsEnabled()) return;

  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch (error) {
    console.error('Sound playback failed:', error);
  }
}

/**
 * Play success beep (440Hz, 100ms)
 */
export function playSuccessSound() {
  playBeep(440, 100);
}

/**
 * Play error buzz (200Hz, 150ms)
 */
export function playErrorSound() {
  playBeep(200, 150);
}

/**
 * Play completion chime (two-note)
 */
export function playCompletionSound() {
  if (!areSoundsEnabled()) return;
  playBeep(523, 200);
  setTimeout(() => playBeep(659, 200), 150);
}
