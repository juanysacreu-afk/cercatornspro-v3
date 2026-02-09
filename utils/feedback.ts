
/**
 * Feedback Utility for Sound and Haptics
 * Uses Web Audio API to avoid external assets and navigator.vibrate for haptics.
 */

class FeedbackManager {
    private audioCtx: AudioContext | null = null;

    private initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }

    /**
     * Play a subtle "pro" notification sound
     */
    async playNotification() {
        try {
            this.initAudio();
            if (!this.audioCtx) return;

            const oscillator = this.audioCtx.createOscillator();
            const gainNode = this.audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
            oscillator.frequency.exponentialRampToValueAtTime(440, this.audioCtx.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.1, this.audioCtx.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.3);

            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);

            oscillator.start();
            oscillator.stop(this.audioCtx.currentTime + 0.3);
        } catch (e) {
            console.warn('Audio feedback failed', e);
        }
    }

    /**
     * Play a very short "click" sound
     */
    async playClick() {
        try {
            this.initAudio();
            if (!this.audioCtx) return;

            const oscillator = this.audioCtx.createOscillator();
            const gainNode = this.audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1200, this.audioCtx.currentTime);

            gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.05, this.audioCtx.currentTime + 0.005);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);

            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);

            oscillator.start();
            oscillator.stop(this.audioCtx.currentTime + 0.05);
        } catch (e) {
            console.warn('Audio feedback failed', e);
        }
    }

    /**
     * Haptic feedback (Vibrate)
     */
    haptic(pattern: number | number[] = 10) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    /**
     * Success sequence: Sound + Haptic
     */
    success() {
        this.playNotification();
        this.haptic([10, 30, 10]);
    }

    /**
     * Click sequence: Sound + Haptic
     */
    click() {
        this.playClick();
        this.haptic(5);
    }
}

export const feedback = new FeedbackManager();
