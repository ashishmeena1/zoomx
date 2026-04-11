import { useState, useRef, useCallback, useEffect } from "react";

/**
 * @typedef {Object} UseMediaReturn
 * @property {MediaStream|null}  stream       - The active local media stream (camera + mic)
 * @property {React.MutableRefObject<MediaStream|null>} streamRef - Stable ref to the stream (safe to use in callbacks)
 * @property {boolean}           muted        - Whether the microphone is currently muted
 * @property {boolean}           videoOff     - Whether the camera is currently off
 * @property {boolean}           acquiring    - True while getUserMedia is in-flight
 * @property {string|null}       mediaError   - Human-readable error if media acquisition failed
 * @property {() => Promise<MediaStream|null>} startMedia  - Request camera + mic. Returns stream or null on failure.
 * @property {() => void}        stopMedia    - Stop all tracks and release devices.
 * @property {() => void}        toggleMute   - Toggle microphone on/off.
 * @property {() => void}        toggleVideo  - Toggle camera on/off.
 * @property {(constraints?: MediaStreamConstraints) => Promise<boolean>} switchCamera - Switch to a different camera (e.g. front/back on mobile).
 * @property {MediaDeviceInfo[]} audioInputs  - Available microphone devices.
 * @property {MediaDeviceInfo[]} videoInputs  - Available camera devices.
 * @property {(deviceId: string) => Promise<boolean>} setAudioInput - Switch microphone by deviceId.
 * @property {(deviceId: string) => Promise<boolean>} setVideoInput - Switch camera by deviceId.
 */

/**
 * useMedia — manages the local camera + microphone stream lifecycle.
 *
 * Responsibilities:
 *  - Requesting getUserMedia with sensible defaults
 *  - Exposing mute / camera-off toggles (track.enabled, no re-negotiation)
 *  - Enumerating available input devices
 *  - Switching input devices without dropping the stream
 *  - Cleaning up all tracks on unmount
 *  - Surfacing clear, user-facing error messages for every failure mode
 *
 * Intentionally does NOT handle:
 *  - Screen sharing (that requires RTCRtpSender.replaceTrack across peers)
 *  - Any WebRTC peer connection logic
 *
 * @returns {UseMediaReturn}
 */
export function useMedia() {
    // ── State ─────────────────────────────────────────────────────────────────
    const [stream, setStream] = useState(null);
    const [muted, setMuted] = useState(false);
    const [videoOff, setVideoOff] = useState(false);
    const [acquiring, setAcquiring] = useState(false);
    const [mediaError, setMediaError] = useState(null);

    // Available devices for device-picker UI
    const [audioInputs, setAudioInputs] = useState([]);
    const [videoInputs, setVideoInputs] = useState([]);

    // ── Refs ──────────────────────────────────────────────────────────────────
    /**
     * Stable ref so callbacks (WebRTC, screen share) always see the current stream
     * without needing to be recreated when stream state updates.
     * @type {React.MutableRefObject<MediaStream|null>}
     */
    const streamRef = useRef(null);
    const currentAudioIdRef = useRef(null); // deviceId of active mic
    const currentVideoIdRef = useRef(null); // deviceId of active camera

    // ── Device enumeration ────────────────────────────────────────────────────

    /**
     * Enumerate and store available audio/video input devices.
     * Must be called after the user has granted permissions (labels are empty before that).
     */
    const enumerateDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setAudioInputs(devices.filter((d) => d.kind === "audioinput"));
            setVideoInputs(devices.filter((d) => d.kind === "videoinput"));
        } catch {
            // Non-critical — device list just won't be available
        }
    }, []);

    // ── Internal helpers ──────────────────────────────────────────────────────

    /**
     * Stop all tracks on the current stream and clear state.
     * Does not touch peer connections — caller is responsible for that.
     */
    const _stopAllTracks = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        currentAudioIdRef.current = null;
        currentVideoIdRef.current = null;
        setStream(null);
    }, []);

    /**
     * Map a getUserMedia / enumerateDevices error to a clear message.
     * @param {unknown} err
     * @returns {string}
     */
    function _describeError(err) {
        if (!(err instanceof Error)) return "Could not access camera or microphone.";

        switch (err.name) {
            case "NotAllowedError":
            case "PermissionDeniedError":
                return "Camera and microphone access was denied. " +
                    "Please allow access in your browser settings and reload the page.";

            case "NotFoundError":
            case "DevicesNotFoundError":
                return "No camera or microphone was found. " +
                    "Please connect a device and reload the page.";

            case "NotReadableError":
            case "TrackStartError":
                return "Your camera or microphone is already in use by another application. " +
                    "Close it and try again.";

            case "OverconstrainedError":
            case "ConstraintNotSatisfiedError":
                return "The requested camera settings are not supported by your device.";

            case "AbortError":
                return "Media access was aborted. Please try again.";

            case "SecurityError":
                return "Media access is blocked by your browser's security policy. " +
                    "Ensure the page is served over HTTPS.";

            case "TypeError":
                return "No media constraints were specified. This is a bug — please report it.";

            default:
                return err.message || "An unknown error occurred while accessing media devices.";
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Request access to the camera and microphone.
     * Call this once when the user enters a room.
     *
     * Applies sensible video constraints (720p, 30fps) and echoCancellation.
     * Falls back to any available camera/mic if the ideal constraints can't be met.
     *
     * @param {MediaStreamConstraints} [overrides]  Optional constraint overrides.
     * @returns {Promise<MediaStream|null>}  The stream, or null if permission was denied.
     */
    const startMedia = useCallback(async (overrides = {}) => {
        // Don't acquire twice
        if (streamRef.current) return streamRef.current;

        setAcquiring(true);
        setMediaError(null);

        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                ...(currentAudioIdRef.current
                    ? { deviceId: { exact: currentAudioIdRef.current } }
                    : {}),
                ...(overrides.audio ?? {}),
            },
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                facingMode: "user",
                ...(currentVideoIdRef.current
                    ? { deviceId: { exact: currentVideoIdRef.current } }
                    : {}),
                ...(overrides.video ?? {}),
            },
        };

        try {
            const s = await navigator.mediaDevices.getUserMedia(constraints);

            streamRef.current = s;
            currentAudioIdRef.current = s.getAudioTracks()[0]?.getSettings().deviceId ?? null;
            currentVideoIdRef.current = s.getVideoTracks()[0]?.getSettings().deviceId ?? null;

            setStream(s);
            setMuted(false);
            setVideoOff(false);

            // Now that permissions are granted, labels will be populated
            await enumerateDevices();

            return s;
        } catch (err) {
            const message = _describeError(err);
            setMediaError(message);
            return null;
        } finally {
            setAcquiring(false);
        }
    }, [enumerateDevices]);

    /**
     * Stop all media tracks and release camera/mic hardware.
     * Safe to call multiple times.
     */
    const stopMedia = useCallback(() => {
        _stopAllTracks();
        setMuted(false);
        setVideoOff(false);
        setMediaError(null);
    }, [_stopAllTracks]);

    /**
     * Toggle the microphone on/off.
     * Uses track.enabled (does NOT remove the track from the stream —
     * no WebRTC renegotiation needed).
     */
    const toggleMute = useCallback(() => {
        const audioTrack = streamRef.current?.getAudioTracks()[0];
        if (!audioTrack) return;
        audioTrack.enabled = !audioTrack.enabled;
        setMuted((m) => !m);
    }, []);

    /**
     * Toggle the camera on/off.
     * Uses track.enabled (no renegotiation needed).
     */
    const toggleVideo = useCallback(() => {
        const videoTrack = streamRef.current?.getVideoTracks()[0];
        if (!videoTrack) return;
        videoTrack.enabled = !videoTrack.enabled;
        setVideoOff((v) => !v);
    }, []);

    /**
     * Switch to a specific microphone by deviceId.
     *
     * Acquires a new audio track, replaces the old one in the stream,
     * and preserves the current mute state.
     *
     * @param {string} deviceId
     * @returns {Promise<boolean>}  true on success, false on failure.
     */
    const setAudioInput = useCallback(async (deviceId) => {
        if (!streamRef.current) return false;
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: deviceId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const newAudioTrack = newStream.getAudioTracks()[0];

            // Remove old audio tracks
            streamRef.current.getAudioTracks().forEach((t) => {
                t.stop();
                streamRef.current.removeTrack(t);
            });

            // Respect current mute state on the new track
            newAudioTrack.enabled = !muted;
            streamRef.current.addTrack(newAudioTrack);
            currentAudioIdRef.current = deviceId;

            // Trigger re-render with the same stream object
            // (MediaStream is mutable, so we need a new ref to force React to update)
            setStream(new MediaStream(streamRef.current.getTracks()));

            return true;
        } catch (err) {
            setMediaError(_describeError(err));
            return false;
        }
    }, [muted]);

    /**
     * Switch to a specific camera by deviceId.
     *
     * Acquires a new video track, replaces the old one in the stream,
     * and preserves the current video-off state.
     *
     * @param {string} deviceId
     * @returns {Promise<boolean>}  true on success, false on failure.
     */
    const setVideoInput = useCallback(async (deviceId) => {
        if (!streamRef.current) return false;
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                },
            });

            const newVideoTrack = newStream.getVideoTracks()[0];

            // Remove old video tracks
            streamRef.current.getVideoTracks().forEach((t) => {
                t.stop();
                streamRef.current.removeTrack(t);
            });

            // Respect current video-off state
            newVideoTrack.enabled = !videoOff;
            streamRef.current.addTrack(newVideoTrack);
            currentVideoIdRef.current = deviceId;

            setStream(new MediaStream(streamRef.current.getTracks()));

            return true;
        } catch (err) {
            setMediaError(_describeError(err));
            return false;
        }
    }, [videoOff]);

    /**
     * Switch camera using arbitrary constraints (e.g. facingMode: "environment"
     * for back camera on mobile). Convenience wrapper around setVideoInput.
     *
     * @param {MediaStreamConstraints} [constraints]
     * @returns {Promise<boolean>}
     */
    const switchCamera = useCallback(async (constraints = { video: { facingMode: "environment" } }) => {
        if (!streamRef.current) return false;
        try {
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newVideoTrack = newStream.getVideoTracks()[0];

            streamRef.current.getVideoTracks().forEach((t) => {
                t.stop();
                streamRef.current.removeTrack(t);
            });

            newVideoTrack.enabled = !videoOff;
            streamRef.current.addTrack(newVideoTrack);
            currentVideoIdRef.current = newVideoTrack.getSettings().deviceId ?? null;

            setStream(new MediaStream(streamRef.current.getTracks()));
            return true;
        } catch (err) {
            setMediaError(_describeError(err));
            return false;
        }
    }, [videoOff]);

    // ── Device change listener ─────────────────────────────────────────────────
    // Re-enumerate if user plugs/unplugs a device mid-session
    useEffect(() => {
        const handler = () => enumerateDevices();
        navigator.mediaDevices?.addEventListener("devicechange", handler);
        return () => navigator.mediaDevices?.removeEventListener("devicechange", handler);
    }, [enumerateDevices]);

    // ── Cleanup on unmount ─────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, []);

    return {
        // Stream
        stream,
        streamRef,

        // Toggle state
        muted,
        videoOff,

        // Async state
        acquiring,
        mediaError,

        // Lifecycle
        startMedia,
        stopMedia,

        // Toggles
        toggleMute,
        toggleVideo,

        // Device switching
        switchCamera,
        audioInputs,
        videoInputs,
        setAudioInput,
        setVideoInput,
    };
}