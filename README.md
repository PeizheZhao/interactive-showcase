# Interactive Showcase

A general-purpose GitHub Pages repository for independent interactive exhibits, visual explainers, research maps, demos and teaching materials.

## URL structure

Each exhibit lives in its own directory:

```
/
├── index.html
├── showcases.json
├── showcases/
│   ├── generative-models-timeline/
│   │   └── index.html
│   └── <future-project>/
│       └── index.html
└── .nojekyll
```

With GitHub Pages enabled, every directory gets its own independent URL:

- Root showcase hub: `/<repository>/`
- Generative Models Timeline: `/<repository>/showcases/generative-models-timeline/`
- Future project: `/<repository>/showcases/<project-slug>/`

## Adding a new exhibit

1. Create `showcases/<slug>/index.html`.
2. Add an entry to `showcases.json`.
3. Add a card to the root `index.html`.

The exhibits are intentionally independent: each can have its own HTML, CSS and JavaScript without affecting the others.

## Current exhibit

### Evolution of Generative Modeling
An interactive 2000–2026 map covering autoregressive models, VAEs, GANs, normalizing flows, diffusion, DiT, Flow Matching, unified multimodal generation and world models.
