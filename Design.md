# Emerald Coast Community Band Website Design

## Overview
- **Motion Style**: Cinematic coastal elegance with 3D depth and musical rhythm
- **Animation Intensity**: Ultra-Dynamic
- **Technology Stack**: GSAP ScrollTrigger, Three.js for 3D elements, Custom GLSL shaders, CSS Houdini

## Brand Foundation

### Colors
- Primary: #0f766e (Teal)
- Primary Light: #5eead4 (Light teal/cyan)
- Neutral Dark: #1f2937 (Dark gray)
- Neutral Light: #f9fafb (Light gray/off-white)
- White: #ffffff
- Black: #000000
- Accent: #f59e0b (Amber for CTAs)

### Typography

**Font Families:**
- Display/Headings: "Oswald", sans-serif
- Body: "Inter", sans-serif

**Font URLs:**
- Google Fonts: https://fonts.googleapis.com/css?family=Oswald:200,300,400,500,600,700|Inter:100,200,300,regular,500,600,700,800,900

**Font Sizes:**
- H1: 60px (Mobile: 48px)
- H2: 48px (Mobile: 38px)
- H3: 38px (Mobile: 32px)
- H4: 32px (Mobile: 26px)
- H5: 24px (Mobile: 22px)
- H6: 20px (Mobile: 18px)
- Body: 16px

**Font Weights:**
- Light: 300
- Normal: 400
- Medium: 500
- Semibold: 600
- Bold: 700

**Line Heights:**
- Headings: 1.2
- Body: 1.5

### Core Message
A welcoming community of musicians where passion for music meets coastal charm. Professional quality, amateur spirit.

---

## Global Motion System

### Animation Timing

**Easing Library:**
```css
--ease-dramatic: cubic-bezier(0.87, 0, 0.13, 1);
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--ease-expo-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-expo-in: cubic-bezier(0.7, 0, 0.84, 0);
--ease-elastic: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

**Duration Scale:**
- Micro: 150ms (hover states)
- Fast: 300ms (button interactions)
- Normal: 500ms (element transitions)
- Slow: 800ms (section reveals)
- Cinematic: 1200ms (hero sequences)
- Ambient: 8000-20000ms (continuous loops)

**Stagger Patterns:**
- Cascade: 100ms between elements
- Wave: 80ms with sine offset
- Explosion: 50ms from center outward
- Musical: 120ms with alternating direction

### Continuous Effects

**Floating Musical Elements:**
- Musical note icons float gently across hero section
- Path: Sine wave motion with 15px amplitude
- Duration: 12-18s per traversal
- Opacity: 0.3-0.6, blur: 1px
- Quantity: 5-8 notes maximum

**Coastal Drift:**
- Subtle wave-like motion on decorative elements
- Transform: translateY with 8px range
- Duration: 6s ease-in-out infinite

**Living Gradients:**
- Hero overlay gradient subtly shifts
- Hue rotation: ±5° over 20s
- Creates organic, breathing feel

### Scroll Engine

**Parallax Configuration:**
```javascript
layers: {
  background: { speed: 0.3, direction: 'vertical' },
  midground: { speed: 0.6, direction: 'vertical' },
  foreground: { speed: 1.0, direction: 'vertical' },
  floating: { speed: 1.3, direction: 'both' }
}
```

**Pin Points:**
- Hero section: Pinned for 50vh additional scroll
- Quote section: Pinned for 30vh with text reveal

**Progress-Driven Animations:**
- Navigation: Background opacity 0→1 over first 200px scroll
- Section titles: Scale 0.9→1 + opacity 0→1
- Images: Clip-path reveal from polygon(0 0, 0 0, 0 100%, 0 100%) to full

---

## Section 1: Navigation

### Layout
- Position: Fixed, z-index: 1000
- Initial: Transparent with glass morphism on scroll
- Height: 80px, transforms to 64px on scroll

#### Spatial Composition
- Logo: Left-aligned with magnetic hover effect
- Nav links: Center with staggered reveal
- CTA: Right with glow pulse animation

### Content
- Logo: Emerald Coast Community Band
- Links: Home, About, Join Us, Events, Contact
- CTA: "Join The Band"

### Motion Choreography

#### Entrance Sequence
| Element | Animation | Values | Duration | Delay | Easing |
|---------|-----------|--------|----------|-------|--------|
| Logo | Clip reveal + fade | clipPath: inset(0 100% 0 0) → inset(0) | 600ms | 0ms | expo-out |
| Nav links | Slide up + fade | y: 20px→0, opacity: 0→1 | 400ms | 100ms stagger | expo-out |
| CTA | Scale pop | scale: 0.8→1, opacity: 0→1 | 500ms | 400ms | elastic |

#### Scroll Effects
| Trigger | Element | Effect | Start | End | Values |
|---------|---------|--------|-------|-----|--------|
| 0-200px | Nav background | Glass morphism | 0px | 200px | backdrop-blur: 0→20px, bg: transparent→rgba(255,255,255,0.9) |
| 0-200px | Nav height | Shrink | 0px | 200px | height: 80px→64px |
| 0-100px | Logo | Brightness | 0px | 100px | filter: brightness(10)→brightness(1) |

#### Interaction Effects

**Nav Links Hover:**
- Underline draws from center outward (transform: scaleX 0→1)
- Text color shift: white→#5eead4
- Duration: 250ms
- Transform origin: center

**CTA Button:**
- Magnetic attraction: Button moves 8px toward cursor on approach
- Glow intensifies: box-shadow spreads 0→15px
- Scale: 1→1.05 on hover
- Background gradient animation on hover

---

## Section 2: Hero

### Layout
- Full viewport height (100vh minimum)
- Split composition: Content left (55%), Visual right (45%)
- Overlapping layers with z-depth

#### Spatial Composition
```
┌─────────────────────────────────────────────────────────┐
│  ┌─────────────────┐                    ┌──────────┐  │
│  │   HEADLINE      │     ~~~~~~~~       │ INSTRUM. │  │
│  │   Split across  │    ~~~~~~~~~       │   3D     │  │
│  │   two lines     │   ~~~~~~~~~~       │ ROTATOR  │  │
│  └─────────────────┘    ~~~~~~~~~      └──────────┘  │
│                         ~~~~~~~~                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │         SUBTEXT + CTA                            │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

- Content offset: 8% from left edge
- Instrument rotator: Positioned at 65% from left, overlaps content edge
- Wave decoration: SVG path animated at bottom

### Content

**Headline (Split for animation):**
- Line 1: "Unleash Your"
- Line 2: "Musical Talent"

**Subtext:**
"Join our vibrant community of musicians. Open to all skill levels. Weekly rehearsals every Tuesday at 7 PM."

**CTAs:**
- Primary: "Join The Band"
- Secondary: "Learn More"

### Images

**Hero Background Image:**
- Resolution: 1920x1080 (responsive with srcset)
- Aspect Ratio: 16:9
- Transparent Background: No
- Visual Style: Lifestyle photography, candid moment
- Subject: Diverse group of 7 young adult musicians in casual summer clothing, arranged in loose semicircle, playing acoustic guitars, smiling and laughing
- Composition: Group shot, all subjects in sharp focus, centered arrangement
- Setting: Outdoor lakeside with calm water, forest, and mountain in background, natural daylight
- Lighting: Soft natural daylight, even illumination, minimal shadows
- Mood: Joyful, relaxed, friendly, inclusive, community-oriented
- Color Palette: Natural greens (forest), blues (lake/sky), warm earth tones (clothing/instruments), soft pastels
- Post-processing: Slightly enhanced vibrancy, warm tone overlay, high sharpness on subjects
- Generation Prompt: "A diverse group of seven young adult musicians, men and women, sitting outdoors in a semicircle by a calm lake with a forest and mountain in the background. They are smiling, laughing, and playing acoustic guitars together in a relaxed, joyful atmosphere. The scene is bathed in soft natural daylight, with vibrant greens, blues, and warm earth tones. The mood is friendly and inclusive, capturing the spirit of community and summer fun. The image is sharp, with a slight warm overlay and enhanced vibrancy."

**Hero Instrument Rotator:**
- Frame 1: Electric bass guitar
  - Transparent Background: No
  - Photography Style: Product photography, clean studio shot
  - Subject: Black electric bass guitar with chrome hardware and black pickguard, angled vertically
  - Composition: Centered, slight angle for depth, ample negative space
  - Lighting: Soft diffused from front and above, minimal shadows, highlights on chrome hardware
  - Mood: Professional, clean, modern
  - Background: Pure white, seamless
  - Generation Prompt: "A high-resolution studio photograph of a black electric bass guitar with chrome hardware and a black pickguard. The guitar is centered and angled slightly, with soft, even lighting highlighting the glossy finish and metallic details. The background is pure white, and the image is clean, professional, and free of distractions."

- Frame 2: Acoustic guitar
  - Transparent Background: No
  - Photography Style: Product photography, clean studio shot
  - Subject: Natural wood acoustic guitar with light glossy finish, dark pickguard, soundhole rosette, angled vertically
  - Composition: Centered, slight angle for depth, ample negative space
  - Lighting: Soft diffused from front and above, minimal shadows, highlights on glossy wood
  - Mood: Professional, clean, modern
  - Background: Pure white, seamless
  - Generation Prompt: "A high-resolution studio photograph of a natural wood acoustic guitar with a light glossy finish, dark pickguard, and decorative soundhole rosette. The guitar is centered and angled slightly, with soft, even lighting highlighting the wood grain and glossy surface. The background is pure white, and the image is clean, professional, and free of distractions."

- Frame 3: Electric guitar
  - Transparent Background: No
  - Photography Style: Product photography, clean studio shot
  - Subject: Black electric guitar with white pickguard, three pickups, angled vertically
  - Composition: Centered, slight angle for depth, ample negative space
  - Lighting: Soft diffused from front and above, minimal shadows, highlights on glossy finish and hardware
  - Mood: Professional, clean, modern
  - Background: Pure white, seamless
  - Generation Prompt: "A high-resolution studio photograph of a black electric guitar with a white pickguard and three pickups. The guitar is centered and angled slightly, with soft, even lighting highlighting the glossy finish and metallic hardware. The background is pure white, and the image is clean, professional, and free of distractions."

### Motion Choreography

#### Entrance Sequence
| Element | Animation | Values | Duration | Delay | Easing |
|---------|-----------|--------|----------|-------|--------|
| Background | Ken Burns zoom | scale: 1.1→1, slight pan | 8000ms | 0ms | linear |
| Overlay | Fade in | opacity: 0→0.5 | 800ms | 0ms | smooth |
| Headline Line 1 | Split chars reveal | y: 100%→0, opacity: 0→1 per char | 50ms/char | 200ms | expo-out |
| Headline Line 2 | Split chars reveal | y: 100%→0, opacity: 0→1 per char | 50ms/char | 600ms | expo-out |
| Subtext | Blur fade | blur: 10px→0, opacity: 0→1 | 600ms | 1000ms | smooth |
| CTA Primary | Scale bounce | scale: 0→1.1→1 | 500ms | 1200ms | elastic |
| CTA Secondary | Slide left | x: 30px→0, opacity: 0→1 | 400ms | 1350ms | expo-out |
| Instrument rotator | 3D flip in | rotateY: 90°→0°, opacity: 0→1 | 800ms | 400ms | expo-out |
| Wave decoration | Path draw | stroke-dashoffset: 100%→0% | 1500ms | 800ms | expo-out |

#### Scroll Effects
| Trigger | Element | Effect | Start | End | Values |
|---------|---------|--------|-------|-----|--------|
| 0-50vh | Headline | Parallax up | 0 | 50vh | y: 0→-80px |
| 0-50vh | Subtext | Parallax up (slower) | 0 | 50vh | y: 0→-40px |
| 0-60vh | Instrument rotator | 3D rotation | 0 | 60vh | rotateY: 0°→15°, scale: 1→0.9 |
| 0-100vh | Background | Parallax | 0 | 100vh | y: 0→100px |
| 50vh-100vh | All content | Fade out | 50vh | 100vh | opacity: 1→0 |

#### Continuous Animations

**Instrument Rotator:**
- 3D carousel rotation: 360° over 12s
- Auto-play with pause on hover
- Perspective: 1000px
- Transform-style: preserve-3d

**Floating Notes:**
- 5-8 musical note SVGs
- Each follows unique bezier path
- Duration: 12-18s, infinite
- Opacity: 0.3-0.6
- Size: 20-40px

**Wave Decoration:**
- Subtle morphing animation
- Path points shift ±5px
- Duration: 4s ease-in-out infinite

### Advanced Effects

#### 3D Elements

**Instrument Carousel:**
```css
.carousel-container {
  perspective: 1000px;
  transform-style: preserve-3d;
}

.instrument-card {
  transform: rotateY(calc(var(--index) * 120deg)) translateZ(200px);
  backface-visibility: hidden;
  transition: transform 0.6s var(--ease-expo-out);
}
```

#### Shader Effects

**Hero Overlay (GLSL):**
- Subtle noise texture overlay
- Animated grain: 24fps
- Blend mode: overlay at 10% opacity
- Creates film-like quality

**Gradient Pulse:**
- Radial gradient centered on CTA
- Subtle expansion/contraction
- Color: #0f766e at 5% opacity
- Duration: 3s ease-in-out infinite

---

## Section 3: Quote

### Layout
- Full-width, centered content
- Pinned during scroll for dramatic reveal
- Background: #f9fafb

#### Spatial Composition
- Quote text: Max-width 900px, centered
- Attribution: Below quote, right-aligned
- Decorative quotation marks: Large, semi-transparent, positioned behind text

### Content

**Quote:**
"Music is the universal language of mankind, and community is where that language finds its voice."

**Attribution:**
- Name: "Sarah Martinez"
- Title: "Band Member"

### Motion Choreography

#### Entrance Sequence
| Element | Animation | Values | Duration | Delay | Easing |
|---------|-----------|--------|----------|-------|--------|
| Opening quote mark | Scale + rotate | scale: 0→1, rotate: -45°→0° | 600ms | 0ms | elastic |
| Quote text | Word-by-word reveal | opacity: 0→1, blur: 5px→0 per word | 40ms/word | 200ms | smooth |
| Closing quote mark | Scale + rotate | scale: 0→1, rotate: 45°→0° | 600ms | after text | elastic |
| Attribution | Slide up | y: 20px→0, opacity: 0→1 | 400ms | +200ms | expo-out |

#### Scroll Effects
| Trigger | Element | Effect | Start | End | Values |
|---------|---------|--------|-------|-----|--------|
| Section enter | Quote | Pin | top | +30vh | position: fixed |
| Pin progress | Words | Stagger reveal | 0% | 80% | Each word fades in sequentially |
| Pin complete | All | Unpin + fade | 80% | 100% | opacity: 1→0 |

#### Continuous Animations

**Quote Marks:**
- Gentle floating motion
- translateY: ±8px
- Duration: 6s ease-in-out infinite
- Opacity: 0.1

---

## Section 4: About

### Layout
- Two-column asymmetric grid: 55% image / 45% content
- Image breaks left edge (bleed effect)
- Content vertically centered with offset

#### Spatial Composition
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────────┐         ┌─────────────────────┐  │
│  │                  │         │                     │  │
│  │     IMAGE        │~~~~~~~~~│   HEADLINE          │  │
│  │     (bleeds      │         │   Split reveal      │  │
│  │      left)       │         │                     │  │
│  │                  │         │   Description       │  │
│  │                  │         │   Paragraph         │  │
│  │                  │         │                     │  │
│  │                  │         │   [CTA Button]      │  │
│  └──────────────────┘         └─────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Image: Negative margin-left creates edge bleed
- Content: Padding-left 60px for breathing room
- Decorative wave: Between image and content

### Content

**Headline:**
"About Our Band"

**Description:**
"We're a diverse group of music enthusiasts from all walks of life. From classical to contemporary, we play it all with heart and harmony."

**CTA:**
"Discover Our Story"

### Images

**About Section Image:**
- Resolution: 1200x1600
- Aspect Ratio: 3:4
- Transparent Background: No
- Photography Style: Lifestyle photography, candid moment
- Subject: Group of 6 young adults (men and women) standing close together, smiling, laughing, arms around shoulders
- Composition: Tight group formation, triangular arrangement with tallest in center
- Setting: Outdoor in grassy field with soft bokeh background (trees, sky)
- Lighting: Natural daylight, soft and even, no harsh shadows
- Mood: Joyful, friendly, inclusive, warm, positive
- Color Palette: Natural greens (grass), warm earth tones (clothing), soft pastels
- Post-processing: Slightly enhanced vibrancy, warm tone overlay, high sharpness on subjects
- Generation Prompt: "A diverse group of six young adults, men and women, standing close together in a grassy field, smiling and laughing with their arms around each other. The scene is bathed in soft natural daylight, creating a warm, joyful, and inclusive atmosphere. The background is softly blurred with trees and sky, emphasizing the group's connection. The color palette features natural greens, warm earth tones, and soft pastels, with enhanced vibrancy and a warm overlay."

### Motion Choreography

#### Entrance Sequence
| Element | Animation | Values | Duration | Delay | Easing |
|---------|-----------|--------|----------|-------|--------|
| Image | Clip reveal diagonal | clipPath: polygon(0 0, 0 0, 0 100%, 0 100%) → full | 800ms | 0ms | expo-out |
| Image | Scale settle | scale: 1.1→1 | 1200ms | 0ms | smooth |
| Wave decoration | Path draw | stroke-dashoffset: 100%→0% | 1000ms | 400ms | expo-out |
| Headline | Split words | y: 40px→0, opacity: 0→1 per word | 60ms/word | 300ms | expo-out |
| Description | Fade up | y: 30px→0, opacity: 0→1 | 500ms | 600ms | smooth |
| CTA | Slide left | x: 20px→0, opacity: 0→1 | 400ms | 800ms | expo-out |

#### Scroll Effects
| Trigger | Element | Effect | Start | End | Values |
|---------|---------|--------|-------|-----|--------|
| Section 20%-80% | Image | Parallax | 20% | 80% | y: 40px→-40px |
| Section 0%-100% | Content | Parallax (slower) | 0% | 100% | y: 20px→-20px |
| Section 30%-70% | Wave | Morph | 30% | 70% | Path points shift ±10px |

#### Interaction Effects

**Image Hover:**
- Scale: 1→1.03
- Filter: brightness(1)→brightness(1.05)
- Duration: 400ms

---

## Section 5: Join Us

### Layout
- Mirror of About section: 45% content / 55% image
- Image breaks right edge (bleed effect)
- Content vertically centered

#### Spatial Composition
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌─────────────────────┐    ┌──────────────────┐       │
│  │                     │    │                  │       │
│  │   HEADLINE          │~~~~│     IMAGE        │       │
│  │   Split reveal      │    │     (bleeds      │       │
│  │                     │    │      right)      │       │
│  │   Description       │    │                  │       │
│  │   Paragraph         │    │                  │       │
│  │                     │    │                  │       │
│  │   [CTA Button]      │    │                  │       │
│  └─────────────────────┘    └──────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Content

**Headline:**
"Join Our Musical Family"

**Description:**
"Open to all musicians, regardless of experience. We rehearse every Tuesday at 7 PM at Meigs Middle School. Come make music with us!"

**CTA:**
"Become A Member"

### Images

**Join Us Section Image:**
- Resolution: 1200x1600
- Aspect Ratio: 3:4
- Transparent Background: No
- Photography Style: Lifestyle photography, candid moment
- Subject: Two young men playing guitars (one electric, one acoustic), smiling and interacting
- Composition: Side by side, shallow depth of field, focus on faces and hands
- Setting: Indoor with large window, natural backlight creating silhouettes
- Lighting: Soft natural light from window, warm and inviting, backlit
- Mood: Friendly, relaxed, collaborative, warm
- Color Palette: Warm earthy tones (browns, beiges), soft whites, hints of green
- Post-processing: Slightly enhanced contrast, warm tone overlay, soft vignette
- Generation Prompt: "Two young men playing guitars side by side in a bright, naturally lit room. One is playing an electric guitar, the other an acoustic guitar. They are smiling and interacting, with warm backlighting from a large window creating a soft, inviting silhouette effect. The color palette is warm and earthy, with browns, beiges, and soft whites. The mood is friendly and collaborative, with a slight warm overlay and soft vignette."

### Motion Choreography

#### Entrance Sequence
| Element | Animation | Values | Duration | Delay | Easing |
|---------|-----------|--------|----------|-------|--------|
| Content | Slide from left | x: -60px→0, opacity: 0→1 | 600ms | 0ms | expo-out |
| Headline | Split words | y: 40px→0, opacity: 0→1 per word | 60ms/word | 200ms | expo-out |
| Description | Fade up | y: 30px→0, opacity: 0→1 | 500ms | 500ms | smooth |
| CTA | Scale pop | scale: 0.8→1, opacity: 0→1 | 400ms | 700ms | elastic |
| Image | Clip reveal diagonal | clipPath: polygon(100% 0, 100% 0, 100% 100%, 100% 100%) → full | 800ms | 300ms | expo-out |

#### Scroll Effects
| Trigger | Element | Effect | Start | End | Values |
|---------|---------|--------|-------|-----|--------|
| Section 20%-80% | Image | Parallax | 20% | 80% | y: 40px→-40px |
| Section 0%-100% | Content | Parallax (slower) | 0% | 100% | y: 20px→-20px |

---

## Section 6: Events

### Layout
- Three-column grid with hover expansion
- Cards have 3D tilt on hover
- Staggered vertical positions (middle card offset -20px)

#### Spatial Composition
```
┌─────────────────────────────────────────────────────────┐
│                      EVENTS HEADLINE                    │
│                      Description text                   │
├─────────────────────┬─────────────────────┬─────────────┤
│                     │     ┌───────┐       │             │
│   ┌───────────┐     │     │ IMAGE │       │  ┌─────────┐│
│   │  IMAGE    │     │     └──┬────┘       │  │  IMAGE  ││
│   └────┬──────┘     │        │ TITLE      │  └────┬────┘│
│        │ TITLE      │        │ DATE       │       │TITLE │
│        │ DATE       │        │ CTA        │       │DATE  │
│        │ CTA        │        └────────────│       │CTA   │
│        └────────────│                     │       └──────┘
└─────────────────────┴─────────────────────┴─────────────┘
```

- Cards: Equal width with 24px gap
- Middle card: translateY(-20px) for visual interest
- Hover: Card scales 1.05, siblings dim to 0.7 opacity

### Content

**Section Headline:**
"Upcoming Events"

**Description:**
"Experience our music live at performances throughout the year."

**Events:**
1. "Spring Concert" - April 15, 2024
2. "Summer Festival" - July 8, 2024
3. "Holiday Gala" - December 12, 2024

### Images

**Event Image 1 (Spring Concert):**
- Resolution: 800x600
- Aspect Ratio: 4:3
- Transparent Background: No
- Photography Style: Event photography, live performance
- Subject: Young male performer on stage with microphone, wearing plaid shirt and jeans, holding guitar neck
- Composition: Medium close-up, slightly off-center following rule of thirds
- Setting: Outdoor daytime event, stage with sound equipment, crowd visible in foreground (blurred)
- Lighting: Natural daylight, soft and even, no harsh shadows
- Mood: Energetic, lively, festive, community event
- Color Palette: Warm earth tones (browns, greens), soft blues (sky), plaid pattern
- Post-processing: Slightly enhanced contrast, warm tone overlay, shallow depth of field
- Generation Prompt: "A young male musician performing on an outdoor stage, holding a guitar and singing into a microphone. He wears a plaid shirt and jeans, standing on a stage with sound equipment and a blurred crowd in the foreground. The lighting is natural and soft, creating a lively, energetic atmosphere. The color palette features warm earth tones and soft blues, with enhanced contrast and a warm overlay."

**Event Image 2 (Summer Festival):**
- Resolution: 800x600
- Aspect Ratio: 4:3
- Transparent Background: No
- Photography Style: Event photography, live performance
- Subject: Young woman with curly hair and glasses, wearing olive green top, singing into microphone on stage
- Composition: Centered, medium shot, eye-level perspective
- Setting: Outdoor festival, crowd visible in foreground (blurred), stage with speakers and equipment
- Lighting: Natural daylight, soft and diffused, high-key exposure
- Mood: Energetic, lively, festive, joyful
- Color Palette: Warm earth tones (browns, beiges), olive green, soft whites
- Post-processing: Slightly enhanced vibrancy, warm tone overlay, shallow depth of field
- Generation Prompt: "A young woman with curly hair and glasses, wearing an olive green top, singing into a microphone on an outdoor stage. The background is blurred, showing a crowd and festival equipment, with soft natural daylight creating a lively, energetic atmosphere. The color palette is warm and earthy, with enhanced vibrancy and a warm overlay."

**Event Image 3 (Holiday Gala):**
- Resolution: 800x600
- Aspect Ratio: 4:3
- Transparent Background: No
- Photography Style: Event photography, live performance
- Subject: Young man with dark hair and beard, wearing white shirt and dark pants, holding microphone stand
- Composition: Slightly off-center, medium shot, eye-level perspective
- Setting: Indoor venue with dramatic architectural backdrop (blurred)
- Lighting: Soft diffused lighting, high-key exposure, no harsh shadows
- Mood: Energetic, lively, festive, joyful
- Color Palette: Warm earth tones (browns, beiges), soft whites, muted greens and blues
- Post-processing: Slightly enhanced contrast, warm tone overlay, shallow depth of field
- Generation Prompt: "A young man with dark hair and a beard, wearing a white shirt and dark pants, holding a microphone stand and performing on stage. The background is blurred with dramatic architectural elements, and the lighting is soft and diffused, creating a lively, energetic atmosphere. The color palette is warm and earthy, with enhanced contrast and a warm overlay."

### Motion Choreography

#### Entrance Sequence
| Element | Animation | Values | Duration | Delay | Easing |
|---------|-----------|--------|----------|-------|--------|
| Section headline | Split words | y: 40px→0, opacity: 0→1 per word | 60ms/word | 0ms | expo-out |
| Description | Fade up | y: 20px→0, opacity: 0→1 | 500ms | 300ms | smooth |
| Card 1 | Rise + fade | y: 60px→0, opacity: 0→1 | 600ms | 400ms | expo-out |
| Card 2 | Rise + fade | y: 60px→-20px, opacity: 0→1 | 600ms | 500ms | expo-out |
| Card 3 | Rise + fade | y: 60px→0, opacity: 0→1 | 600ms | 600ms | expo-out |

#### Scroll Effects
| Trigger | Element | Effect | Start | End | Values |
|---------|---------|--------|-------|-----|--------|
| Section 0%-50% | All cards | Stagger rise | 0% | 50% | y: 40px→0 (staggered) |
| Section 30%-70% | Middle card | Float | 30% | 70% | y: -20px→-30px→-20px |

#### Interaction Effects

**Card Hover (3D Tilt):**
- Transform: perspective(1000px) rotateX(var(--rotateX)) rotateY(var(--rotateY))
- Rotation range: ±10° based on cursor position
- Scale: 1→1.05
- Shadow: 0 10px 30px rgba(0,0,0,0.2)
- Sibling cards: opacity 1→0.6
- Duration: 300ms

**Image Hover:**
- Scale: 1→1.1
- Filter: brightness(1)→brightness(1.1)
- Duration: 400ms

**CTA Hover:**
- Background: transparent→#0f766e
- Color: #0f766e→#ffffff
- Scale: 1→1.05
- Duration: 300ms

---

## Section 7: Footer

### Layout
- Three-column grid: 1.5fr 1fr 1fr
- Wave decoration at top (SVG)
- Background: #0f766e

#### Spatial Composition
```
┌─────────────────────────────────────────────────────────┐
│  ~~~~~~~~~~~~~ WAVE DECORATION ~~~~~~~~~~~~~~~~        │
├────────────────────┬────────────────┬───────────────────┤
│                    │                │                   │
│   NEWSLETTER       │   LINKS        │   SOCIAL          │
│   JOIN FORM        │   Home         │   Facebook        │
│                    │   About        │   Instagram       │
│                    │   Join Us      │   Twitter         │
│                    │   Events       │                   │
│                    │   Contact      │                   │
│                    │                │                   │
└────────────────────┴────────────────┴───────────────────┘
```

### Content

**Newsletter:**
- Headline: "Join Our Newsletter"
- Subtext: "Stay updated with our latest news and events."
- Form: Email input + Submit button

**Links:**
- Home, About, Join Us, Events, Contact

**Social:**
- Facebook, Instagram, Twitter

### Motion Choreography

#### Entrance Sequence
| Element | Animation | Values | Duration | Delay | Easing |
|---------|-----------|--------|----------|-------|--------|
| Wave decoration | Path draw | stroke-dashoffset: 100%→0% | 1200ms | 0ms | expo-out |
| Newsletter headline | Slide up | y: 30px→0, opacity: 0→1 | 500ms | 200ms | expo-out |
| Form | Fade in | opacity: 0→1 | 400ms | 400ms | smooth |
| Link column | Stagger slide | y: 20px→0, opacity: 0→1 | 300ms | 100ms stagger | expo-out |
| Social column | Stagger slide | y: 20px→0, opacity: 0→1 | 300ms | 100ms stagger | expo-out |

#### Interaction Effects

**Form Input:**
- Focus: Border color transition #5eead4→#ffffff
- Focus: Box-shadow glow 0 0 0 3px rgba(94,234,212,0.3)
- Placeholder: Fade out on focus
- Duration: 200ms

**Submit Button:**
- Hover: Scale 1.05, brightness 1.1
- Active: Scale 0.98
- Success: Checkmark icon morphs in
- Duration: 250ms

**Links:**
- Hover: Color #ffffff→#5eead4
- Hover: x: 0→5px (slide right)
- Duration: 200ms

**Social Icons:**
- Hover: Scale 1.2, rotate 10°
- Hover: Color shift to #5eead4
- Duration: 250ms elastic

---

## Technical Implementation Notes

### Required Libraries

**Core Animation:**
- GSAP 3.x with ScrollTrigger plugin
- SplitType for text splitting
- Lenis for smooth scrolling (optional)

**3D Effects:**
- CSS 3D transforms (preferred for performance)
- Three.js only if complex 3D scenes needed

**SVG Animation:**
- Native CSS/SMIL or GSAP for path animations

### Performance Optimizations

**GPU Acceleration:**
```css
.animated-element {
  transform: translateZ(0);
  will-change: transform, opacity;
  contain: layout style paint;
}
```

**Intersection Observer:**
- Trigger animations only when elements enter viewport
- Threshold: 0.2
- Root margin: "50px"

**Reduced Motion Support:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Scroll Performance:**
- Use `passive: true` for scroll listeners
- Throttle scroll calculations to 16ms (60fps)
- Use CSS `scroll-timeline` where supported

### Browser Support

**Feature Detection:**
```javascript
const supports3D = CSS.supports('transform-style', 'preserve-3d');
const supportsScrollTimeline = CSS.supports('animation-timeline', 'scroll()');
```

**Fallback Strategy:**
- Progressive enhancement approach
- Core content accessible without JS
- Animations enhance but don't block content

### Responsive Breakpoints

**Desktop:** > 991px (full effects)
**Tablet:** 768px - 991px (reduced parallax, simpler 3D)
**Mobile:** < 768px (essential animations only, no 3D tilt)

---

## Quality Metrics

This design achieves:
- ✓ **Emotional Impact**: Music comes alive through motion
- ✓ **Memorability**: 3D instrument carousel and split text animations create lasting impression
- ✓ **Uniqueness**: Coastal wave motifs and musical floating elements are distinct
- ✓ **Technical Ambition**: 3D transforms, shader overlays, scroll-driven animations
- ✓ **Coherence**: Musical rhythm informs all timing decisions
- ✓ **Surprise & Delight**: Magnetic buttons, 3D card tilt, word-by-word reveals
- ✓ **Professional Excellence**: 60fps animations, reduced motion support, performance optimized
- ✓ **Typography Mastery**: Split text animations enhance readability through focus
- ✓ **Visual Hierarchy**: Motion guides attention from hero → content → CTAs
- ✓ **User Experience**: Smooth, responsive, accessible
