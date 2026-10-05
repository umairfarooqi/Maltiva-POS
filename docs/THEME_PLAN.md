# Dark and light theme implementation plan

## Goal

Default to a modern, minimalist dark theme. Provide an immediate Dark / Light setting saved per device. Use solid colors, restrained teal accents, subtle borders, and no gradients, blur, glow, or decorative shadows.

## Palette and roles

| Role | Light | Dark |
|---|---|---|
| Canvas | #f4f6f5 | #121416 |
| Chrome | #f8fafa | #181b1e |
| Surface | #ffffff | #1d2125 |
| Raised / hover | #f1f5f9 | #2c3238 |
| Inset / input | #f8fafc | #171b1f |
| Text | #18211f | #eef1f4 |
| Secondary | #52605c | #bdc5cd |
| Muted / placeholder | #64748b | #98a3ae |
| Border / divider | #d9e0df | #343c44 |
| Control border | #94a3b8 | #596570 |
| Action / hover | #008f77 / #007462 | #008f77 / #007462 |
| Accent text / focus | #007462 | #5dd6bf |
| Selected background | #e6f7f5 | #193b35 |
| Success background / text | #ecfdf5 / #166534 | #18382b / #8ce0b1 |
| Warning background / text | #fffbeb / #92400e | #3b2d18 / #f1ca80 |
| Danger background / text | #fff1f2 / #9f1239 | #3d2229 / #f3a6b7 |
| Information background / text | #eff6ff / #1d4ed8 | #1d3045 / #9dc9f5 |
| Reserved background / text | #faf5ff / #7e22ce | #302641 / #cdb2ef |

## Implementation sequence

1. Introduce semantic Tailwind colors backed by CSS variables for both themes.
2. Replace component-specific neutral and status colors throughout existing screens. Preserve original photo, avatar, and logo colors.
3. Apply saved preference before first paint; missing or invalid preference defaults to dark. Storage failure must not prevent rendering or switching.
4. Add Settings Appearance toggle with immediate changes, independent of business-settings save. Synchronize same-origin customer display windows through storage events.
5. Keep receipt preview paper light. Force light tokens for all printed receipts and reports.
6. Verify preference persistence, synchronization, theme coverage, contrast, responsive layouts, and print rules; run relevant tests, TypeScript, and production build.

## Acceptance criteria

- No white startup flash in dark mode.
- Dark is the default; saved light survives reload and logout.
- Settings switch is keyboard accessible and reports its current state.
- Every existing screen and modal uses semantic theme colors.
- Status meaning is communicated in text as well as color.
- Receipt paper and print output remain light.
- No global color inversion, gradient, decorative shadow, or blur.
- No sales, inventory, authentication, or printer behavior changes.

## Contrast refinements

Measured contrast required small palette adjustments: action #00836e for white button text, light muted text #5f6e82, light control border #7b8998, and dark control border #606c78. These replace the initial proposed values to meet 4.5:1 normal-text and 3:1 control-boundary targets.
