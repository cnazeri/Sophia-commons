# Sophia Commons - Design and Style Guide

## Brand Identity

- **Mission:** A digital sanctuary for the anthroposophical, Waldorf, and Steiner community
- **Tone:** Warm, grounded, contemplative, modern yet rooted in tradition
- **Aesthetic:** Organic forms, natural beauty, spiritual depth

---

## Color Palette

### Primary Colors

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Background | Warm Ivory | `#FAF7F2` | Page backgrounds |
| Surface | Soft Cream | `#F0EBE3` | Card backgrounds, elevated surfaces |
| Primary Text | Deep Earth | `#2C2418` | Headlines, primary content |
| Secondary Text | Warm Gray | `#6B5E50` | Body text, descriptions |
| Muted Text | Stone | `#9A8F82` | Metadata, captions |

### Accent Colors

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Primary Accent | Wisdom Gold | `#B8923A` | CTAs, active states, key links |
| Primary Hover | Deep Gold | `#9A7A2E` | Hover states |
| Secondary Accent | Forest Sage | `#5E7B5A` | Tags, categories, success |
| Tertiary Accent | Dusty Rose | `#C4907A` | Warm highlights, badges |
| Border | Warm Border | `#E4DDD4` | Dividers, card borders |

### Extended Colors

| Role | Hex |
|------|-----|
| Gold Light | `#F5EDD8` |
| Sage Light | `#E8F0E6` |
| Rose Light | `#F9EDE8` |
| Background Muted | `#E8E2D9` |
| Border Subtle | `#EDE8E0` |
| Border Strong | `#C8BFB3` |
| Error | `#B85450` |
| Info | `#5A7088` |

---

## Typography

### Font Stack

- **Headlines:** Lora (Google Fonts), fallback Georgia, serif
- **Body/UI:** Nunito Sans (Google Fonts), fallback Segoe UI, sans-serif
- **Alternative:** Cormorant Garamond (headlines) + Source Sans 3 (body) for an editorial feel

### Type Scale (1.25 ratio, Major Third)

| Token | Size | Pixels | Usage |
|-------|------|--------|-------|
| xs | 0.75rem | 12px | Metadata, badges |
| sm | 0.875rem | 14px | Captions, small UI |
| base | 1rem | 16px | Body text |
| md | 1.125rem | 18px | Lead paragraphs |
| lg | 1.25rem | 20px | Card titles |
| xl | 1.5rem | 24px | Section headers |
| 2xl | 2rem | 32px | Page titles |
| 3xl | 2.5rem | 40px | Hero text (mobile) |
| 4xl | 3.25rem | 52px | Hero text (desktop) |

### Line Heights

| Token | Value | Usage |
|-------|-------|-------|
| Tight | 1.2 | Headlines |
| Normal | 1.6 | Body text |
| Relaxed | 1.8 | Long-form reading |

### Letter Spacing

| Token | Value | Usage |
|-------|-------|-------|
| Tight | -0.01em | Large headlines |
| Normal | 0 | Default |
| Wide | 0.05em | Uppercase labels, navigation |

---

## Spacing System (8px base)

| Token | Value | Pixels |
|-------|-------|--------|
| space-1 | 0.25rem | 4px |
| space-2 | 0.5rem | 8px |
| space-3 | 0.75rem | 12px |
| space-4 | 1rem | 16px |
| space-5 | 1.5rem | 24px |
| space-6 | 2rem | 32px |
| space-7 | 3rem | 48px |
| space-8 | 4rem | 64px |

---

## Layout

- **Container max width:** 1200px
- **Grid:** CSS Grid with `auto-fill, minmax(320px, 1fr)`
- **Mobile-first approach**

### Breakpoints

| Name | Width | Target |
|------|-------|--------|
| sm | 640px | Large phones |
| md | 768px | Tablets |
| lg | 1024px | Laptops |
| xl | 1280px | Desktops |

---

## Components

### Cards

```css
.card {
  background: #FFFFFF;
  border: 1px solid #EDE8E0;
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.2s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(44, 36, 24, 0.08);
}
```

### Glass-morphism Variant

```css
.card-glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}
```

### Buttons

- **Primary:** Wisdom Gold background, pill shape (`border-radius: 50px`), white text
- **Secondary:** Transparent with gold border
- **Hover:** `translateY(-1px)`, darker shade
- **Active:** `scale(0.97)`
- **Padding:** `0.75rem 2rem`

```css
.btn-primary {
  background: #B8923A;
  color: #FFFFFF;
  border-radius: 50px;
  padding: 0.75rem 2rem;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: #9A7A2E;
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: scale(0.97);
}

.btn-secondary {
  background: transparent;
  color: #B8923A;
  border: 1.5px solid #B8923A;
  border-radius: 50px;
  padding: 0.75rem 2rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
```

### Category Tags

Pill shape (`border-radius: 50px`), colored by category:

| Category | Background | Text Color |
|----------|-----------|------------|
| Waldorf/Education | `#E8F0E6` (Sage Light) | `#5E7B5A` (Forest Sage) |
| Biodynamic/Agriculture | `#E6DDC4` | `#6B5A2F` |
| Eurythmy/Arts | `#F9EDE8` (Rose Light) | `#C4907A` (Dusty Rose) |
| Medicine/Health | `#D8E8F0` | `#3A6078` |
| Community | `#F5EDD8` (Gold Light) | `#B8923A` (Wisdom Gold) |

### Navigation

- **Sticky header** with `backdrop-filter: blur(10px)`
- **Background:** `rgba(250, 247, 242, 0.9)`
- **Nav links:** uppercase, 14px, weight 600, `letter-spacing: 0.05em`
- **Active/hover:** Wisdom Gold color
- **Mobile:** hamburger menu with slide-in drawer from right

```css
.nav-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(250, 247, 242, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #EDE8E0;
}

.nav-link {
  text-transform: uppercase;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #6B5E50;
  transition: color 0.2s ease;
}

.nav-link:hover,
.nav-link.active {
  color: #B8923A;
}
```

### Search Bar

- Pill shape with 1.5px border
- Focus state: gold border + gold glow shadow

```css
.search-bar {
  border-radius: 50px;
  border: 1.5px solid #E4DDD4;
  padding: 0.75rem 1.25rem;
  transition: all 0.2s ease;
}

.search-bar:focus {
  border-color: #B8923A;
  box-shadow: 0 0 0 3px #F5EDD8;
  outline: none;
}
```

### Modal

- Fade-in with scale animation (0.95 to 1.0)
- Backdrop color: `rgba(44, 36, 24, 0.5)`
- Card style with `border-radius: 16px`

```css
.modal-backdrop {
  background: rgba(44, 36, 24, 0.5);
}

.modal-content {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 2rem;
  animation: modalIn 0.3s ease;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

---

## Animations and Micro-interactions

### Scroll Animations

- Elements fade in with `translateY(16px)` to `translateY(0)`
- Duration: 0.4s ease
- Stagger: 0.05s between siblings
- Trigger: Intersection Observer at threshold 0.1

```css
.scroll-reveal {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.scroll-reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Hover Effects

- **Cards:** lift + enhanced shadow
- **Buttons:** slight `translateY(-1px)` + color shift
- **Links:** underline slides in from left via `::after` pseudo-element
- **Images in cards:** `scale(1.03)` on parent hover

```css
.card-image {
  transition: transform 0.3s ease;
  overflow: hidden;
}

.card:hover .card-image img {
  transform: scale(1.03);
}

.link-animated {
  position: relative;
}

.link-animated::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 1.5px;
  background: #B8923A;
  transition: width 0.2s ease;
}

.link-animated:hover::after {
  width: 100%;
}
```

### Transition Defaults

| Property | Duration | Easing |
|----------|----------|--------|
| Default (most interactions) | 0.2s | ease |
| Colors | 0.2s | ease |
| Transforms | 0.15s | ease |
| Backdrop blur | 0.3s | ease |

---

## Imagery Guidelines

- **Photography:** natural light, warm tones, authentic community moments
- **Placeholders:** warm abstract watercolor textures or organic geometric forms (lemniscates, spirals)
- **Icons:** rounded, organic set (Phosphor Icons light weight or Lucide)
- **Decorative elements:** subtle organic curves as section dividers, not hard lines

---

## Accessibility

- WCAG AA minimum contrast ratios
- All images must have descriptive alt text
- ARIA labels on all interactive elements
- Keyboard navigation support with visible focus indicators
- Skip-to-content link
- Semantic HTML (`header`, `nav`, `main`, `section`, `footer`)

### Focus Ring

```css
:focus-visible {
  outline: 2px solid #B8923A;
  outline-offset: 2px;
}
```

---

## Directory Categories

1. Waldorf Schools and Education
2. Biodynamic Farms and Agriculture
3. Anthroposophic Medicine and Health
4. Camphill Communities
5. Eurythmy and Arts
6. Study Groups and Branches
7. Publishers and Bookshops
8. Practitioners and Consultants
9. Events and Conferences

---

## Footer

- **Background:** Deep Earth (`#2C2418`)
- **Text:** Warm Ivory (`#FAF7F2`)
- **Layout:** multi-column (4 columns desktop, 2 tablet, 1 mobile)
- **Sections:** About, Directory, Community, Connect

```css
.footer {
  background: #2C2418;
  color: #FAF7F2;
  padding: 3rem 1.5rem;
}

.footer-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;
}

@media (max-width: 768px) {
  .footer-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .footer-grid {
    grid-template-columns: 1fr;
  }
}
```
