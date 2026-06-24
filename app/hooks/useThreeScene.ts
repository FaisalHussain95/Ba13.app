'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { ViewerWall, ViewerPlafond } from '@/types/viewer'

// We never import three at the top level — it must remain in the async chunk.
// All THREE types are accessed through `typeof import('three')`.

type ThreeNS = typeof import('three')
type OrbitControlsCtor = typeof import('three/addons/controls/OrbitControls.js')['OrbitControls']

/** Returns true when the device is likely mobile (small screen or touch-only). */
function detectMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || ('ontouchstart' in window && window.innerWidth < 1024)
}

// ── AABB helper ─────────────────────────────────────────────────────────────

export interface WallAABB {
  /** Centre of wall footprint in X. */
  cx: number
  /** Centre of wall at mid-height. */
  cy: number
  /** Centre of wall footprint in Z. */
  cz: number
  /** Maximum span across all axes (used for camera distance). */
  maxSpan: number
  /** Maximum wall height across all segments. */
  maxH: number
}

/**
 * Compute an axis-aligned bounding box (in world space) over all segments of
 * a ViewerWall. Returns the AABB centre and the largest span so camera-framing
 * code (initial framing + preset views) can share the same computation.
 */
export function computeWallAABB(viewerWall: ViewerWall): WallAABB | null {
  if (viewerWall.segments.length === 0) return null

  let minX = Infinity, maxX = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  let maxH = 0

  for (const seg of viewerWall.segments) {
    const endX = seg.startX + Math.cos(seg.angleRad) * seg.length
    const endZ = seg.startZ - Math.sin(seg.angleRad) * seg.length

    minX = Math.min(minX, seg.startX, endX)
    maxX = Math.max(maxX, seg.startX, endX)
    minZ = Math.min(minZ, seg.startZ, endZ)
    maxZ = Math.max(maxZ, seg.startZ, endZ)
    maxH = Math.max(maxH, seg.height)
  }

  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  const maxSpan = Math.max(spanX, spanZ, maxH, 1)

  return { cx, cy: maxH / 2, cz, maxSpan, maxH }
}

// ── Preset view type ─────────────────────────────────────────────────────────

export type ViewPreset = 'face' | '3-4' | 'dessus' | 'reset'

// ── Ref shapes ───────────────────────────────────────────────────────────────

interface ThreeSceneRefs {
  renderer: InstanceType<ThreeNS['WebGLRenderer']> | null
  camera: InstanceType<ThreeNS['PerspectiveCamera']> | null
  scene: InstanceType<ThreeNS['Scene']> | null
  controls: InstanceType<OrbitControlsCtor> | null
  groundGeometry: InstanceType<ThreeNS['PlaneGeometry']> | null
  groundMaterial: InstanceType<ThreeNS['MeshStandardMaterial']> | null
  rafId: number | null
  /** Frames remaining for damping settle after the last interaction. */
  settleFrames: number
  /**
   * Triggers the on-demand render loop (calls startRenderLoop inside init).
   * Stored here so the ResizeObserver closure — which is created before init()
   * resolves — can kick a proper render without duplicating render logic.
   * Null until init() completes successfully.
   */
  requestRender: (() => void) | null
  /**
   * Dispose function returned by buildCloison. Called before rebuilding wall
   * geometry or on unmount. Null when no wall geometry has been built yet.
   *
   * S1: every geometry/mesh created by the builder is tracked inside this
   * disposer. Calling it removes meshes from the scene and disposes all
   * BufferGeometries — preventing leaks across rebuilds.
   */
  cloisonDispose: (() => void) | null
  /**
   * STORY-6a: Dispose function returned by buildPlafond. Independent of
   * cloisonDispose — disposed separately in both the geometry-effect rebuild
   * path AND the mount-effect cleanup.
   *
   * S1: every geometry/mesh created by the ceiling builder is tracked inside
   * this disposer. Null when no ceiling geometry has been built yet, or when
   * the span is invalid (validerPortee gate).
   */
  plafondDispose: (() => void) | null
  /**
   * STORY-7: Persisted visibility state for the plafond structure layer
   * (furring + BA13 board, userData.layer === 'plafond'). Default true (visible).
   * Stored in refs (NOT React state) so toggling does NOT trigger a geometry
   * rebuild — only a visibility flip + requestRender. Re-applied after every
   * buildPlafond() call so the state survives geometry rebuilds.
   */
  plafondVisible: boolean
  /**
   * STORY-7: Persisted visibility state for the isolation layer
   * (userData.layer === 'isolation'). Default FALSE (hidden per spec §7 default).
   * Same no-rebuild guarantee as plafondVisible.
   */
  isolationVisible: boolean
  /**
   * PART A: Set true once the mount effect's async init() completes.
   * The geometry effect guards on this flag to avoid running before the
   * renderer/scene/camera are ready.
   */
  ready: boolean
  /** The loaded THREE module, stored by the mount effect for reuse. */
  THREE: ThreeNS | null
  /**
   * STORY-5A: Cached ViewerMaterials singleton reference.
   * Stored after the first buildGeometry() call so setTransparency() can access
   * MAT_PLATRE synchronously (without a second dynamic import() call) in a user
   * interaction handler.
   */
  mats: import('@/lib/viewer/materials').ViewerMaterials | null
  /**
   * PART A: Callback to trigger geometry rebuild. Set by the mount effect so
   * the geometry effect can request a rebuild. The geometry effect sets this
   * to the current build function, and the mount effect calls it once init
   * is complete to handle the first build.
   */
  triggerGeometryBuild: (() => void) | null
  /**
   * PART C: Last framed AABB — stored so preset view functions can reference
   * it without re-computing from a stale viewerWall closure.
   */
  lastAABB: WallAABB | null
  /**
   * V4-S2: Typed cleanup fn for the single pointerup listener registered in
   * init(). Stored here so the mount-effect cleanup closure can call it without
   * an intersection cast on refs.current.
   */
  cleanupClickHandlers: (() => void) | null

  // ── PART D: Tap-to-identify state ────────────────────────────────────────
  /**
   * The currently-highlighted object (if any). We clone its material to apply
   * emissive highlight without mutating shared singleton materials. On clear,
   * we restore the original material and dispose the clone.
   *
   * NEVER mutate MAT_ACIER/MAT_PLATRE/MAT_RAIL in place — they are shared
   * singletons that would highlight every element using that material.
   */
  highlightedObject: InstanceType<ThreeNS['Mesh']> | InstanceType<ThreeNS['InstancedMesh']> | null
  /**
   * The cloned material applied to the highlighted object. Must be disposed
   * when we clear the highlight (it is not a shared singleton).
   */
  highlightMaterialClone: InstanceType<ThreeNS['Material']> | null
  /** Original material before highlight — restored on clear. */
  originalMaterial: InstanceType<ThreeNS['Material']> | InstanceType<ThreeNS['Material']>[] | null
}

// ── Return type ──────────────────────────────────────────────────────────────

export interface ThreeSceneAPI {
  /**
   * PART C: Set a preset camera view.
   * Call after the mount effect has resolved; no-ops if the scene is not ready.
   */
  setView: (preset: ViewPreset) => void
  /**
   * PART D: Clear any active highlight + tooltip.
   * Exposed so Ba13Viewer can call it from the tooltip dismiss button.
   */
  clearHighlight: () => void
  /**
   * STORY-5A: Toggle BA13 board transparency.
   *
   * Design decision — singleton mutation (option i):
   *   MAT_PLATRE is the one shared plaster material used by all board
   *   InstancedMeshes. Transparency is a global view mode (not per-element),
   *   so mutating the singleton directly is the right model — every board
   *   reflects the same state. This is the ONE allowed in-place mutation of a
   *   singleton (opacity/transparent are view state, not the per-tap emissive
   *   highlight which must stay clone-based).
   *
   *   We do NOT touch emissive or color on the singleton — only opacity and
   *   the transparent flag. material.needsUpdate is set so Three.js picks up
   *   the change on the next render.
   *
   *   Singleton state is reset to opaque in the mount-effect cleanup so a
   *   fresh viewer always starts with opacity=1 regardless of whether a previous
   *   instance unmounted with transparency ON.
   */
  setTransparency: (on: boolean) => void
  /**
   * STORY-5B: Capture the current 3D view as a PNG download.
   *
   * Design decision — synchronous render-then-capture (option ii):
   *   We do NOT use preserveDrawingBuffer:true on the renderer (avoids the
   *   permanent perf cost of copying the framebuffer after every frame).
   *   Instead we call renderer.render(scene, camera) synchronously immediately
   *   before toDataURL() in the same JS task — the drawing buffer is guaranteed
   *   to be populated at that point. The refs give us direct access to all
   *   three objects without any async gap.
   *
   *   No-ops gracefully when the scene is not ready (renderer/scene/camera null).
   */
  capturePNG: () => void
  /**
   * STORY-7: Show or hide the ceiling structure (furring + BA13 board).
   *
   * Visibility toggle — NOT a geometry rebuild. Iterates scene.children and
   * flips .visible on every mesh whose userData.layer === 'plafond'. The state
   * is stored in refs.plafondVisible and re-applied after every geometry rebuild
   * so the toggle survives dimension edits.
   *
   * No-ops when the scene is not ready.
   */
  setPlafondVisible: (on: boolean) => void
  /**
   * STORY-7: Show or hide the insulation layer (glass-wool slab).
   *
   * Visibility toggle — NOT a geometry rebuild. Iterates scene.children and
   * flips .visible on every mesh whose userData.layer === 'isolation'. Default
   * is hidden (isolationVisible starts false per spec §7). Same rebuild-survival
   * guarantee as setPlafondVisible.
   *
   * No-ops when the scene is not ready.
   */
  setIsolationVisible: (on: boolean) => void
}

// ── Highlight helper types ───────────────────────────────────────────────────

export interface HitInfo {
  designation: string
  catalogId: string
  /** Screen-space position hint (used to position the tooltip near the tap). */
  screenX: number
  screenY: number
}

/**
 * Manages the full Three.js lifecycle for a given canvas element.
 *
 * STORY-4: Split into two effects:
 *  1. Mount effect (deps [canvasRef]) — creates renderer/scene/camera/lights/
 *     ground/controls/render-loop once. Never re-runs when viewerWall changes.
 *  2. Geometry effect (deps [viewerWall]) — disposes previous cloison and
 *     rebuilds it whenever viewerWall changes. Guards on refs.current.ready.
 *
 * Lazy-imports `three` and `OrbitControls` inside the mount effect so they
 * never enter the initial bundle.
 *
 * Returns a ThreeSceneAPI with setView (preset camera) and clearHighlight.
 *
 * @param onHit   Called when a mesh is tapped — receives hit info for the tooltip.
 * @param onMiss  Called when empty space is tapped — clears the tooltip.
 */
export function useThreeScene(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  viewerWall: ViewerWall | null,
  /**
   * STORY-6b: pre-validated, pre-adapted ceiling params (ViewerPlafond — all
   * dims in metres). Null when no ceiling is configured or the span is invalid.
   * The span-gate (validerPortee) and mm→m conversion (plafondToViewer) are
   * both applied in ViewerCanvas before this prop is set, so this hook is dumb:
   * build when non-null, skip when null.
   */
  plafond: ViewerPlafond | null,
  onHit?: (info: HitInfo) => void,
  onMiss?: () => void
): ThreeSceneAPI {
  const refs = useRef<ThreeSceneRefs>({
    renderer: null,
    camera: null,
    scene: null,
    controls: null,
    groundGeometry: null,
    groundMaterial: null,
    rafId: null,
    settleFrames: 0,
    requestRender: null,
    cloisonDispose: null,
    plafondDispose: null,
    ready: false,
    THREE: null,
    mats: null,
    triggerGeometryBuild: null,
    lastAABB: null,
    highlightedObject: null,
    highlightMaterialClone: null,
    originalMaterial: null,
    cleanupClickHandlers: null,
    // STORY-7: visibility toggle state — persisted in refs, NOT React state,
    // so toggling never triggers a geometry rebuild.
    plafondVisible: true,    // default: plafond structure visible
    isolationVisible: false, // default: isolation HIDDEN per spec §7
  })

  // Stable callback refs so the mount effect's event listeners never close over
  // stale values from the geometry effect.
  const onHitRef = useRef(onHit)
  const onMissRef = useRef(onMiss)
  // Sync the refs inside an effect to satisfy the react-hooks/refs lint rule
  // (no ref mutation during render). Because the click handler runs
  // asynchronously (user gesture, not during render), the latest values will
  // always be present by the time the handler fires.
  useEffect(() => {
    onHitRef.current = onHit
  })
  useEffect(() => {
    onMissRef.current = onMiss
  })

  // ── PART D: clearHighlight (stable, returned in API) ─────────────────────

  const clearHighlight = useCallback(() => {
    const r = refs.current
    if (!r.highlightedObject) return

    // Restore the original shared singleton material.
    // highlightedObject is typed Mesh | InstancedMesh — both expose .material.
    if (r.originalMaterial !== null) {
      r.highlightedObject.material = r.originalMaterial
    }

    // Dispose the cloned material — it is NOT a shared singleton.
    r.highlightMaterialClone?.dispose()

    r.highlightedObject = null
    r.highlightMaterialClone = null
    r.originalMaterial = null

    r.requestRender?.()
  }, [])

  // ── PART C: setView (stable, returned in API) ─────────────────────────────

  const setView = useCallback((preset: ViewPreset) => {
    const r = refs.current
    if (!r.ready || !r.camera || !r.controls || !r.lastAABB) return

    const { cx, cy, cz, maxSpan, maxH } = r.lastAABB

    switch (preset) {
      case 'face': {
        // Frontal view: camera directly in front of the wall centre, looking at it.
        const dist = maxSpan * 1.6
        r.camera.position.set(cx, cy, cz + dist)
        r.camera.lookAt(cx, cy, cz)
        r.controls.target.set(cx, cy, cz)
        break
      }
      case '3-4': {
        // Default diagonal perspective — same as the initial AABB reframing.
        const dist = maxSpan * 1.8
        r.camera.position.set(cx + dist, cy + dist * 0.8, cz + dist)
        r.camera.lookAt(cx, cy, cz)
        r.controls.target.set(cx, cy, cz)
        break
      }
      case 'dessus': {
        // Top-down plan view: camera above the wall centre, looking straight down.
        const dist = maxSpan * 1.5
        r.camera.position.set(cx, maxH + dist, cz)
        r.camera.lookAt(cx, 0, cz)
        r.controls.target.set(cx, 0, cz)
        break
      }
      case 'reset': {
        // Re-run the default AABB reframing (same as 3/4 — the "initial" view).
        const dist = maxSpan * 1.8
        r.camera.position.set(cx + dist, cy + dist * 0.8, cz + dist)
        r.camera.lookAt(cx, cy, cz)
        r.controls.target.set(cx, cy, cz)
        break
      }
    }

    r.controls.update()
    r.requestRender?.()
  }, [])

  // ── Mount effect: create renderer/scene/camera/lights/ground/controls ─────
  // deps: [canvasRef] only — never re-runs when viewerWall changes.

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let destroyed = false
    // Track whether a render loop is already scheduled.
    let loopRunning = false

    async function init(): Promise<void> {
      // Dynamic imports — three stays out of the initial bundle.
      const THREE = await import('three')
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js')

      if (destroyed || !canvasRef.current) return

      const el = canvasRef.current
      const isMobile = detectMobile()

      // ── Renderer ──────────────────────────────────────────────────────────
      let renderer: InstanceType<ThreeNS['WebGLRenderer']>
      try {
        renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true })
      } catch {
        // WebGL unavailable — the fallback UI is handled in ViewerCanvas.
        return
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      // Guard against a zero-size canvas (can happen when the panel or
      // BottomSheet hasn't finished its CSS transition yet). setSize(0,0)
      // produces a degenerate framebuffer; the ResizeObserver will correct
      // the size once real dimensions are available.
      const initW = Math.max(el.clientWidth, 1)
      const initH = Math.max(el.clientHeight, 1)
      renderer.setSize(initW, initH, false)

      if (!isMobile) {
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
      }

      // ── Scene ─────────────────────────────────────────────────────────────
      const scene = new THREE.Scene()
      scene.background = null // transparent so the parent bg shows through

      // ── Camera ────────────────────────────────────────────────────────────
      // Use the clamped dimensions so aspect is never NaN when the canvas is
      // still at zero size during a panel/sheet transition.
      const aspect = initW / initH
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000)
      // 3/4 high view — looking down at the scene from front-right.
      camera.position.set(4, 5, 6)
      camera.lookAt(0, 1, 0)

      // ── Lights ────────────────────────────────────────────────────────────
      const ambient = new THREE.AmbientLight(0xffffff, 0.6)
      scene.add(ambient)

      const sun = new THREE.DirectionalLight(0xffffff, 1.2)
      sun.position.set(5, 8, 3)
      if (!isMobile) {
        sun.castShadow = true
        sun.shadow.mapSize.width = 1024
        sun.shadow.mapSize.height = 1024
      }
      scene.add(sun)

      // ── Ground plane ──────────────────────────────────────────────────────
      const groundGeometry = new THREE.PlaneGeometry(20, 20)
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8e8e4,
        roughness: 0.9,
        metalness: 0.0,
      })
      const ground = new THREE.Mesh(groundGeometry, groundMaterial)
      ground.rotation.x = -Math.PI / 2
      ground.position.y = 0
      if (!isMobile) ground.receiveShadow = true
      scene.add(ground)

      // ── Controls ──────────────────────────────────────────────────────────
      const controls = new OrbitControls(camera, el)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.minDistance = 0.5
      controls.maxDistance = 20
      controls.target.set(0, 1, 0)
      controls.update()

      // Store refs for cleanup and resize.
      refs.current.renderer = renderer
      refs.current.camera = camera
      refs.current.scene = scene
      refs.current.controls = controls
      refs.current.groundGeometry = groundGeometry
      refs.current.groundMaterial = groundMaterial
      refs.current.THREE = THREE

      // ── On-demand render loop ─────────────────────────────────────────────
      // We render only while the user is interacting + a few extra frames for
      // damping to settle — this avoids a permanent RAF burning battery.
      const SETTLE_FRAMES = 30 // ~0.5 s at 60 fps

      function renderFrame(): void {
        if (destroyed) return
        const r = refs.current
        if (!r.renderer || !r.scene || !r.camera || !r.controls) return

        r.controls.update()
        r.renderer.render(r.scene, r.camera)

        r.settleFrames--
        if (r.settleFrames > 0) {
          r.rafId = requestAnimationFrame(renderFrame)
        } else {
          r.rafId = null
          loopRunning = false
        }
      }

      function startRenderLoop(): void {
        if (loopRunning) {
          // Already running — reset settle window so it doesn't cut short.
          refs.current.settleFrames = SETTLE_FRAMES
          return
        }
        loopRunning = true
        refs.current.settleFrames = SETTLE_FRAMES
        refs.current.rafId = requestAnimationFrame(renderFrame)
      }

      // Expose startRenderLoop through refs so the ResizeObserver — which is
      // created before init() resolves — can trigger a proper on-demand render
      // (including controls.update() + damping settle) without duplicating logic.
      refs.current.requestRender = startRenderLoop

      // Kick a render whenever OrbitControls emits a 'change' event (drag /
      // zoom / rotate triggers this).
      controls.addEventListener('change', startRenderLoop)

      // ── PART D: Raycaster + tap-to-identify ─────────────────────────────
      // We set up the raycaster on mount so it persists across geometry rebuilds.
      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()

      // V4-C1: single pointerup handler — fires once per tap on mobile (no
      // synthetic-click duplication) and once per click on desktop. PointerEvent
      // exposes clientX/clientY directly, so no TouchEvent branch is needed.
      function handleCanvasClick(event: PointerEvent): void {
        const r = refs.current
        if (!r.renderer || !r.scene || !r.camera) return

        const canvas = r.renderer.domElement
        const rect = canvas.getBoundingClientRect()

        const clientX = event.clientX
        const clientY = event.clientY

        // Normalise to NDC [-1, 1].
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1

        raycaster.setFromCamera(pointer, r.camera)

        const hits = raycaster.intersectObjects(r.scene.children, true)

        // Filter to only scene objects that carry userData (cloison elements).
        const hit = hits.find(
          (h) => h.object.userData && h.object.userData.designation
        )

        if (!hit) {
          // Tap on empty space — clear highlight + tooltip.
          clearHighlight()
          onMissRef.current?.()
          return
        }

        const obj = hit.object as InstanceType<ThreeNS['Mesh']> | InstanceType<ThreeNS['InstancedMesh']>

        // If we tapped the same object again, just clear.
        if (obj === r.highlightedObject) {
          clearHighlight()
          onMissRef.current?.()
          return
        }

        // Clear any previous highlight first.
        clearHighlight()

        // ── Apply highlight ──────────────────────────────────────────────
        // IMPORTANT: NEVER mutate the shared singleton materials
        // (MAT_ACIER / MAT_PLATRE / MAT_RAIL) in place — that would highlight
        // every element sharing the material and corrupt other viewer instances.
        //
        // Strategy: clone the material for this specific object, set emissive
        // on the clone, assign it to the object, and restore the original
        // material on clear. The clone is disposed when cleared — it is NOT
        // a shared singleton.
        //
        // For InstancedMesh, the same clone-and-restore strategy applies at the
        // whole-mesh level (V2.0 limitation: all instances share the highlight).
        // Per-instance colour via setColorAt would require a colour attribute
        // buffer and is deferred to V2.1.

        // obj is typed Mesh | InstancedMesh — both expose .material directly.
        const currentMaterial = obj.material

        // If the object has an array of materials, clone the first for the highlight.
        const basemat = Array.isArray(currentMaterial) ? currentMaterial[0] : currentMaterial

        // Clone produces a new material instance — not the shared singleton.
        const clone = basemat.clone() as InstanceType<ThreeNS['MeshStandardMaterial']>
        clone.emissive.setHex(0xffaa00)
        clone.emissiveIntensity = 0.4

        r.highlightedObject = obj
        r.originalMaterial = currentMaterial
        r.highlightMaterialClone = clone

        obj.material = clone

        r.requestRender?.()

        // Notify the React layer with hit info for the tooltip.
        onHitRef.current?.({
          designation: String(obj.userData.designation),
          catalogId: String(obj.userData.catalogId),
          screenX: clientX,
          screenY: clientY,
        })
      }

      // V4-C1: single pointerup listener — fires once per tap on mobile and once
      // per click on desktop. Eliminates the touchend + synthetic-click double-fire
      // that caused the highlight toggle to immediately undo itself on mobile.
      el.addEventListener('pointerup', handleCanvasClick)

      // ── PART A: Signal that the scene is ready ───────────────────────────
      // Set the ready flag and invoke the geometry builder callback if the
      // geometry effect has already run and registered it.
      refs.current.ready = true

      // If the geometry effect ran before init() resolved (possible because
      // init() is async), it will have set triggerGeometryBuild to a pending
      // build function. Call it now.
      if (refs.current.triggerGeometryBuild) {
        refs.current.triggerGeometryBuild()
      }

      // Initial render so the (empty) scene is visible immediately.
      startRenderLoop()

      // V4-S2: store cleanup via the typed ref field (no intersection cast).
      refs.current.cleanupClickHandlers = () => {
        el.removeEventListener('pointerup', handleCanvasClick)
      }
    }

    void init()

    // ── Resize handling ────────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      const el = canvasRef.current
      const r = refs.current
      if (!el || !r.renderer || !r.camera) return
      const w = el.clientWidth
      const h = el.clientHeight
      // Skip degenerate sizes — the observer will fire again when the panel
      // or BottomSheet transition completes and real dimensions are available.
      if (w === 0 || h === 0) return
      r.renderer.setSize(w, h, false)
      r.camera.aspect = w / h
      r.camera.updateProjectionMatrix()
      // Use the on-demand render loop (via the ref set in init) so
      // controls.update() runs and damping is respected. Falls back to a
      // no-op if init() hasn't resolved yet — the initial startRenderLoop()
      // call inside init() will produce the first frame.
      if (r.requestRender) {
        r.requestRender()
      }
    })

    if (canvas) resizeObserver.observe(canvas)

    // Capture the mutable ref object once so the cleanup closure holds a
    // stable reference to it (satisfies react-hooks/exhaustive-deps).
    const sceneRefs = refs.current

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      destroyed = true
      resizeObserver.disconnect()

      // V4-S2: remove the pointerup handler registered in init() via typed ref.
      sceneRefs.cleanupClickHandlers?.()

      if (sceneRefs.rafId !== null) {
        cancelAnimationFrame(sceneRefs.rafId)
        sceneRefs.rafId = null
      }

      // S1: dispose all wall geometry (studs, rails, boards) before tearing
      // down the renderer. The builder tracked every geometry it created.
      sceneRefs.cloisonDispose?.()
      sceneRefs.cloisonDispose = null

      // STORY-6a S1: dispose ceiling geometry independently. MANDATORY — without
      // this call the furring + BA13 board geometries leak on unmount.
      sceneRefs.plafondDispose?.()
      sceneRefs.plafondDispose = null

      // Dispose any cloned highlight material — it is NOT a shared singleton.
      if (sceneRefs.highlightMaterialClone) {
        sceneRefs.highlightMaterialClone.dispose()
        sceneRefs.highlightMaterialClone = null
      }
      sceneRefs.highlightedObject = null
      sceneRefs.originalMaterial = null

      sceneRefs.controls?.dispose()
      sceneRefs.groundGeometry?.dispose()
      // groundMaterial is per-instance (created inline above), so we dispose it.
      // Contrast with getMaterials() singletons which we never dispose (S2).
      sceneRefs.groundMaterial?.dispose()
      sceneRefs.renderer?.dispose()

      // Reset MAT_PLATRE to default semi-transparent state so a fresh viewer
      // always starts with both BA13 faces visible. The singleton persists
      // across mounts — restore default here to prevent state leakage from
      // a previous deep-transparency session.
      if (sceneRefs.mats) {
        sceneRefs.mats.MAT_PLATRE.transparent = true
        sceneRefs.mats.MAT_PLATRE.opacity = 0.55
        sceneRefs.mats.MAT_PLATRE.needsUpdate = true
      }

      // Null out refs so stale callbacks can't access disposed objects.
      sceneRefs.renderer = null
      sceneRefs.camera = null
      sceneRefs.scene = null
      sceneRefs.controls = null
      sceneRefs.groundGeometry = null
      sceneRefs.groundMaterial = null
      sceneRefs.requestRender = null
      sceneRefs.ready = false
      sceneRefs.THREE = null
      sceneRefs.mats = null
      sceneRefs.triggerGeometryBuild = null
      sceneRefs.lastAABB = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef])
  // ^ deps: [canvasRef] only. clearHighlight is stable (useCallback with no deps).
  //   onHit/onMiss are accessed via refs so no dep needed.

  // ── Geometry effect: rebuild cloison + plafond when viewerWall/plafond change
  // PART A: This effect only disposes + rebuilds geometry. The renderer,
  // camera, scene, controls, and lights are untouched.

  useEffect(() => {
    const r = refs.current

    // Define the build function. The mount effect may call it immediately
    // (if init resolves after this effect runs), or this effect calls it
    // directly (if init already resolved — normal case after first mount).
    async function buildGeometry(): Promise<void> {
      const r2 = refs.current
      if (!r2.ready || !r2.scene || !r2.THREE) return

      // Dispose previous cloison before rebuilding.
      r2.cloisonDispose?.()
      r2.cloisonDispose = null

      // STORY-6a S1: dispose previous ceiling geometry before rebuilding.
      // INDEPENDENT of cloison — ceiling may rebuild without wall changes and
      // vice versa. Old ceiling must be removed before building a new one to
      // prevent accumulation across edits.
      r2.plafondDispose?.()
      r2.plafondDispose = null

      // Also clear any highlight state — the highlighted object is being
      // removed from the scene; its cloned material must be disposed.
      if (r2.highlightMaterialClone) {
        r2.highlightMaterialClone.dispose()
        r2.highlightMaterialClone = null
      }
      r2.highlightedObject = null
      r2.originalMaterial = null

      // STORY-6a fix: ceiling renders independently of walls.
      // Only early-return when BOTH are absent — if either is present we must
      // build geometry and frame the camera.
      if (!viewerWall && !plafond) {
        // Nothing to display — re-render the (empty) scene and stop.
        r2.requestRender?.()
        return
      }

      const THREE = r2.THREE

      // Import builders and materials lazily. import() is cached so the second
      // call returns the already-resolved module synchronously.
      // helpers is no longer needed here: plafond is now a ViewerPlafond with
      // all dimensions already in metres (converted by plafondToViewer adapter).
      const [{ buildCloison }, { getMaterials }, { buildPlafond }] = await Promise.all([
        import('@/hooks/useCloisonBuilder'),
        import('@/lib/viewer/materials'),
        import('@/hooks/usePlafondBuilder'),
      ])

      // Re-check ready after async gap.
      if (!refs.current.ready || !refs.current.scene) return

      // getMaterials is always needed — both cloison and plafond use it.
      // STORY-5A: cache the singleton so setTransparency() can access MAT_PLATRE
      // synchronously without a second dynamic import() call.
      const mats = getMaterials(THREE)
      refs.current.mats = mats

      // Build wall geometry only when a wall is present.
      if (viewerWall) {
        const { dispose } = buildCloison(THREE, refs.current.scene, viewerWall, mats)
        refs.current.cloisonDispose = dispose
      }

      // STORY-6a: build ceiling geometry when a pre-validated plafond is provided.
      // Independent of viewerWall — ceiling renders even when no walls are drawn.
      // The span-gate is applied upstream in ViewerCanvas (validerPortee).
      if (plafond) {
        const { dispose: plafondDisposeFn } = buildPlafond(THREE, refs.current.scene, plafond, mats)
        refs.current.plafondDispose = plafondDisposeFn

        // STORY-7: re-apply persisted visibility state to the freshly-built meshes.
        // buildPlafond always creates meshes at default visible=true. If the user
        // had toggled visibility off before this rebuild, we must restore the state
        // so toggles survive dimension edits. This is purely a .visible flag flip —
        // no geometry is created or destroyed.
        const scene = refs.current.scene
        if (scene) {
          const { plafondVisible, isolationVisible } = refs.current
          for (const child of scene.children) {
            const layer = child.userData?.layer as string | undefined
            if (layer === 'plafond')    child.visible = plafondVisible
            if (layer === 'isolation')  child.visible = isolationVisible
          }
        }
      }

      // ── Camera reframing ────────────────────────────────────────────────
      // Primary: frame on wall AABB when walls exist (covers all wall segments).
      // Fallback: when ceiling-only, synthesise a minimal AABB from the ceiling
      // footprint so the camera is centred on the room and the board is visible.
      const wallAABB = viewerWall ? computeWallAABB(viewerWall) : null

      if (wallAABB && refs.current.controls && refs.current.camera) {
        refs.current.lastAABB = wallAABB
        const { cx, cy, cz, maxSpan, maxH } = wallAABB
        refs.current.controls.target.set(cx, maxH / 2, cz)
        const dist = maxSpan * 1.8
        refs.current.camera.position.set(cx + dist, cy + dist * 0.8, cz + dist)
        refs.current.camera.lookAt(cx, maxH / 2, cz)
        refs.current.controls.update()
      } else if (plafond && refs.current.controls && refs.current.camera) {
        // Ceiling-only fallback: derive AABB from ViewerPlafond (all fields in
        // metres — no conversion needed; no await between guard and ref writes).
        const { longueurM, largeurM, hauteurFinieM } = plafond
        const cx = longueurM / 2
        const cz = largeurM  / 2
        const cy = hauteurFinieM / 2
        const maxSpan = Math.max(longueurM, largeurM, hauteurFinieM, 1)
        const ceilingAABB: WallAABB = { cx, cy, cz, maxSpan, maxH: hauteurFinieM }
        refs.current.lastAABB = ceilingAABB
        refs.current.controls.target.set(cx, hauteurFinieM / 2, cz)
        const dist = maxSpan * 1.8
        refs.current.camera.position.set(cx + dist, cy + dist * 0.8, cz + dist)
        refs.current.camera.lookAt(cx, hauteurFinieM / 2, cz)
        refs.current.controls.update()
      }

      refs.current.requestRender?.()
    }

    // ── PART A: First-build coordination ─────────────────────────────────
    // Two timing scenarios:
    //
    // A) Normal (most common): init() has already resolved by the time this
    //    effect runs (e.g. viewerWall changes while viewing). r.ready is true
    //    → call buildGeometry() directly.
    //
    // B) First mount race: this effect runs before init() resolves (async
    //    import of three). r.ready is false → register buildGeometry as
    //    triggerGeometryBuild so init() calls it when done.
    //
    // The mount effect checks triggerGeometryBuild at the end of init() and
    // calls it if non-null. This guarantees the first build always happens
    // exactly once, even when three takes time to load.

    if (r.ready) {
      void buildGeometry()
    } else {
      // Store the build function; the mount effect will call it after init().
      r.triggerGeometryBuild = buildGeometry
    }
  }, [viewerWall, plafond])
  // ^ deps: [viewerWall, plafond]. STORY-6a: plafond added so geometry rebuilds
  //   when ceiling config changes, just as it does when the wall changes.
  //   buildGeometry accesses refs (stable); clearHighlight accessed via refs.current.

  // ── STORY-5A: setTransparency ─────────────────────────────────────────────

  const setTransparency = useCallback((on: boolean) => {
    const r = refs.current
    // Guard: mats is cached after the first buildGeometry() call. If it is null,
    // the scene or wall geometry isn't ready yet — silently no-op.
    if (!r.mats) return

    // Mutate the MAT_PLATRE singleton — only opacity is toggled here.
    // transparent stays true always (default semi-transparent, see materials.ts).
    // 'on' = deep x-ray (see ossature); 'off' = normal semi-transparent plate view.
    const { MAT_PLATRE } = r.mats
    MAT_PLATRE.opacity = on ? 0.12 : 0.55
    MAT_PLATRE.needsUpdate = true

    r.requestRender?.()
  }, [])

  // ── STORY-5B: capturePNG ──────────────────────────────────────────────────

  const capturePNG = useCallback(() => {
    const r = refs.current
    // No-op if the scene is not ready.
    if (!r.renderer || !r.scene || !r.camera) return

    // Synchronous render-then-capture in the same JS task.
    // The drawing buffer is populated immediately before toDataURL() so it is
    // never empty — no preserveDrawingBuffer overhead required.
    r.renderer.render(r.scene, r.camera)
    const dataURL = r.renderer.domElement.toDataURL('image/png')

    // Trigger a browser download via a temporary <a> element.
    const a = document.createElement('a')
    a.href = dataURL
    a.download = `cloison-3d-${Date.now()}.png`
    a.click()
    // No URL.revokeObjectURL needed — toDataURL returns a data: URI, not an
    // object URL. The <a> element is not appended to the DOM and is GC'd normally.
  }, [])

  // ── STORY-7: setPlafondVisible ────────────────────────────────────────────
  // Visibility toggle (NOT a rebuild). Persists state in refs so it survives
  // geometry rebuilds (re-applied after buildPlafond in buildGeometry above).

  const setPlafondVisible = useCallback((on: boolean) => {
    const r = refs.current
    r.plafondVisible = on          // persist for re-apply after next rebuild
    if (!r.scene) return
    for (const child of r.scene.children) {
      // eslint-disable-next-line react-hooks/immutability
      if (child.userData?.layer === 'plafond') child.visible = on
    }
    r.requestRender?.()
  }, [])

  // ── STORY-7: setIsolationVisible ──────────────────────────────────────────
  // Visibility toggle for the isolation layer (default hidden per spec §7).
  // Same no-rebuild guarantee as setPlafondVisible.

  const setIsolationVisible = useCallback((on: boolean) => {
    const r = refs.current
    r.isolationVisible = on        // persist for re-apply after next rebuild
    if (!r.scene) return
    for (const child of r.scene.children) {
      // eslint-disable-next-line react-hooks/immutability
      if (child.userData?.layer === 'isolation') child.visible = on
    }
    r.requestRender?.()
  }, [])

  return { setView, clearHighlight, setTransparency, capturePNG, setPlafondVisible, setIsolationVisible }
}
