---
title: PagedAttention Is Finally Coming to llama.cpp — Three Years After It Said No
tags: llm,vllm,ollama,llama.cpp,pagedattention,inference
---

<!--
DRAFT v1 — June 12, 2026 — not ready to publish.
- [BENCHMARK-TODO] in Section 6 needs original numbers (CUDA GPU, PR #22569 @ 0b0f7bd7).
- Open decision: Korean-first or English-first (this draft is English).
- Re-verify PR #22569 head commit before publish (draft PRs get force-pushed).
- Source material: vllm-vs-ollama-report.md in backend.ai-fasttrack scratch.
-->

If you run LLMs locally, you've heard the claim: *vLLM is faster than Ollama, because PagedAttention.* The first half is true and measurable. The second half is a meme — incomplete enough to be misleading, and it has obscured a much more interesting story: llama.cpp, the engine underneath Ollama, evaluated PagedAttention within **weeks** of the paper in 2023 and deliberately said no. Its maintainers kept saying no for three years. And six weeks ago, a draft PR landed that might finally change the answer.

This post is three things: a short, receipt-backed explanation of what PagedAttention actually does; the real reason llama.cpp declined it (it's better than you think); and a first look at draft PR #22569, which brings a paged KV cache to llama.cpp — including the numbers, the restrictions, and the maintainer pushback that's already started.

<!--more-->

## 1. The number everyone quotes

Let's get the headline out of the way. A peer-reviewed benchmark published in May 2026 ran vLLM and Ollama on the same NVIDIA H100 80GB with identical Qwen3-4B weights and pushed up to 100 concurrent users at them. The result: vLLM delivered **20–29× higher throughput and 8–19× lower P95 latency**, with a 100% request success rate while Ollama timed out under load.[^mdpi]

Two details in that paper matter more than the multiplier:

**First, Ollama's ceiling is structural.** Its throughput flatlined at ~0.45 req/s no matter how much load was offered, and the effective concurrency limit (~10 users) matched its configured parallel-slot count. The bottleneck isn't the GPU — Ollama used 15–17% of the H100 while vLLM used 35–69%.

**Second, the multiplier is concurrency-dependent.** A Red Hat benchmark at 10 concurrent users found roughly 3.3×, not 29×.[^redhat] Every published comparison agrees on the *direction*; the *magnitude* depends on how hard you push. If you see the 20–29× figure quoted without its concurrency level attached, someone is selling you something.

So vLLM wins at multi-user throughput, decisively. The question is why — and "PagedAttention" is only a third of the answer.

## 2. What PagedAttention actually is

PagedAttention comes from the SOSP 2023 paper *Efficient Memory Management for Large Language Model Serving with PagedAttention* (Kwon et al., UC Berkeley Sky Computing Lab) — the paper that launched vLLM.[^sosp]

The problem: during generation, every request carries a **KV cache** — the attention keys and values for all of its tokens so far. It's big, it grows one token at a time, and you don't know its final size when the request arrives. Serving systems before 2023 handled this by preallocating one *contiguous* buffer per request, sized for the maximum possible length. The paper profiled what that costs:

> "only 20.4% – 38.2% of the KV cache memory is used to store the actual token states in the existing systems."

**60–80% of KV memory wasted** on over-reservation and fragmentation. And since the number of requests you can batch is bounded by KV memory, the waste directly caps throughput.

The fix is the oldest trick in operating systems: paging. Chop each sequence's KV cache into fixed-size **blocks**, store them non-contiguously wherever they fit, and keep a **block table** mapping logical positions to physical blocks. Allocate blocks on demand as tokens generate. Waste collapses to whatever's left in the last partial block — under 4% in the paper's measurements — and the indirection gives you copy-on-write sharing for free (prefix caching, parallel sampling, beam search).

More usable memory → more sequences resident on the GPU → bigger batches → 2–4× throughput over the 2023 state of the art. That 2–4× was measured against **Orca, which already had continuous batching** — which is what makes it a clean result for the memory management itself, and which brings us to the myth.

## 3. The myth: "Ollama doesn't have continuous batching"

Here's the part most vLLM-vs-Ollama posts get wrong, and the one claim that got *refuted* when I had this research adversarially fact-checked: llama.cpp **has** continuous batching. It has had it since late 2023, and it's enabled by default in `llama-server`.

What llama.cpp built instead of paging is a **unified, slot-based KV cache** (PR #3228, September 2023): one big buffer shared across all parallel sequences, where the total capacity is fixed up front and each cell is either free or owned by a sequence. Georgi Gerganov's design note says it plainly: within this design, "continuous batching is trivial."[^4130]

So the architectural difference between vLLM and llama.cpp is **not** whether requests can join and leave the batch at every step. They both do that. The difference is memory management — and the unified cache has two costs that Gerganov himself documented:

1. **Cross-sequence attention waste.** Attention is computed over the entire shared cache and masked afterward — "suboptimal in the case of many sequences and very long contexts," in his words.
2. **Fragmentation under churn.** Cells freed by finished sequences leave holes; llama.cpp grew a defragmentation option to cope — exactly the failure mode vLLM's block table eliminates by construction.

Both costs only bite when you have *many concurrent sequences*. Which is precisely why llama.cpp didn't care. That was a choice, and it was documented in public, in real time.

## 4. Three years of "no," on the record

Open llama.cpp issue #1955 — "Implement Paged Attention" — and you can watch the decision happen in June 2023, weeks after the vLLM paper.[^1955]

Core developer **slaren**, on why the fragmentation problem doesn't apply:

> "We allocate all the KV memory required for the maximum context length on startup in one block, so we shouldn't have any fragmentation either."

True — for one user. One sequence, one contiguous preallocated cache, nothing to fragment. PagedAttention solves a *multi-tenant* memory problem, and llama.cpp in 2023 did not have tenants.

Core developer **JohannesGaessler**, making the design goal explicit:

> "llama.cpp currently only ever serves one user at a time so this optimization is not applicable. … Yes, for enterprise use where you have one server generating responses for many users in parallel the optimization would be useful. … I don't see how I would benefit from batched inference since I only run llama.cpp for myself on my own hardware."

The issue went stale and was closed in 2024 without implementation. And the position held: in June 2025, Gaessler was still calling paged attention "the wrong solution" for his use case, even while noting the project was investing more in one-server-many-users performance — via its own path (per-sequence KV streams and a "high-throughput mode," PR #14363) rather than paging.

There's even respectable third-party evidence for that stance. Microsoft's vAttention work showed you can get the same fragmentation avoidance with CUDA virtual-memory primitives instead of software paging — and measured paged kernels costing up to ~30% overhead versus contiguous-layout kernels.[^vattention] PagedAttention is *a* solution to KV waste, not *the* solution.

And there's a deeper, less-quoted reason the "just add PagedAttention" demand was never fair: **the backend matrix**. vLLM had to write paged attention kernels for CUDA. llama.cpp would have to write them for CUDA, Metal, CPU, Vulkan, and ROCm — because its whole identity is running everywhere. A memory-management scheme is cheap; reimplementing your attention kernels five times is not. Three years of "no" starts to look less like stubbornness and more like a project correctly pricing its own constraint.

So the fair summary of 2023–2025: Ollama didn't *fail* to adopt PagedAttention. The engine it sits on solved a different problem — one person, modest hardware, contiguous preallocation — and for that problem, the simple design was the correct design.

## 5. What changed: discussion #21961 and draft PR #22569

On April 15, 2026, a contributor (matiaslin) opened design discussion #21961 proposing a paged KV cache for llama.cpp, explicitly modeled on vLLM.[^21961] On April 30, the draft PR followed: **#22569, "feat: implement paged KV cache and attention."**[^22569]

This is not a sketch. As of commit `0b0f7bd7`, it ships:

- **`llama_block_manager`** — physical block lifecycle, refcounting, watermark management, GPU+CPU block pools with swap
- **`llama_kv_cache_paged`** — a block-indexed implementation of llama.cpp's memory interface
- **`llama_paged_scheduler`** — FCFS admission with a token budget and deadlock detection
- **`ggml_paged_attn`** — new paged attention kernels for the **CUDA and CPU** backends (MHA, GQA, MQA)
- 16-token blocks by default, opt-in via `--kv-paged`, 12 unit tests plus end-to-end greedy-equivalence verification across five architectures

The author's numbers, on a single A10G with Llama-3 8B f16 and an identical KV budget:

| Path | Concurrent sequences | Throughput | TTFT | TPOT |
|---|---|---|---|---|
| Unified | 25 | 496 tok/s | 159 ms | 50 ms |
| Unified | 26 | **OOM** | — | — |
| Paged | **247** | **1,256 tok/s** | 791 ms | 179 ms |

Read that table carefully, because it's the whole thesis of this post in three rows. At *equivalent* concurrency, paged and unified are within ~3% of each other — paging buys you nothing for the single-user case, exactly as the maintainers said for three years. But the unified cache falls off a cliff at 26 sequences while the paged cache sails to 247 and **2.5× aggregate throughput**. PagedAttention was never about making your laptop faster. It's about how many users one GPU can carry.

The Phase 1 restrictions matter too: **single CUDA device only, full GPU offload required, `n_batch == n_ubatch`, no SWA architectures** — and, conspicuously, **no Metal kernels**. Phase 2 (copy-on-write, prefix caching, multi-device) is deferred pending acceptance.

And acceptance is genuinely uncertain. Collaborator **ngxson** has already pushed back hard — dismissing the proposal as "slop" and questioning whether a paged cache justifies its complexity without cross-request prefix sharing, which is deferred to Phase 2. That objection has teeth: prefix sharing is a large share of paging's real-world value in serving (every request in a chat app shares the system prompt), and without copy-on-write blocks you're paying the indirection cost for only the fragmentation win. Whether this PR lands, gets rescoped, or dies in review is an open question — which is exactly why it's worth benchmarking *now*, while the design conversation is live.

## 6. My benchmark

<!--
[BENCHMARK-TODO — this section is the post's original contribution; everything above is synthesis. Planned methodology below; replace with results before publish.]

- Hardware: [single CUDA GPU — must satisfy Phase 1 full-offload; candidate: RTX 4090 24GB or an A10G/L4 cloud instance]
- Build: llama.cpp @ PR #22569 head, pinned commit SHA 0b0f7bd7e3c85bda81645edcd7c2c639c67efec0 (the PR may be force-pushed; pin and state it)
- Model: Llama-3 8B f16 to replicate the author, plus one quantized variant (Q4_K_M) to test whether paging's win survives quantization — nobody has published that
- Axes: unified vs --kv-paged, sweep concurrency 1 / 8 / 25 / 50 / 100 / max, fixed prompt+generation lengths; report tok/s, TTFT, TPOT, and the OOM point for each path
- The money chart: throughput-vs-concurrency for both paths, with vLLM on the same hardware as the reference line
- Honesty checks: replicate the ~3% low-concurrency parity claim; measure single-request latency regression (is there any paging tax with one user?); note the TTFT cost visible even in the author's table (159 → 791 ms — admission queueing at 10× the load)
-->

*(Benchmark results coming — this section will carry original numbers from PR #22569 built at commit `0b0f7bd7`.)*

## 7. What this means for Ollama

Even if #22569 lands, **none of this reaches Ollama automatically**, and the path matters:

**The vendoring path.** Ollama vendors llama.cpp for most models, so a merged paged cache would eventually arrive with a vendor bump — but it's opt-in (`--kv-paged`), CUDA-only, and full-offload-only in Phase 1. Ollama would need to plumb the flag through, decide defaults, and almost certainly keep it off for its core audience.

**The Metal gap.** Phase 1 ships no Metal kernels. Ollama's signature audience — Apple Silicon — is excluded from this entire story for now. Anyone with kernel skills looking for a high-leverage open-source contribution: paged attention for the Metal backend is sitting right there.

**The Go-engine wrinkle.** Ollama's newer engine implements its own KV cache in Go (the `kvcache` package), independent of llama.cpp's. Models running on that engine wouldn't get paging from the llama.cpp PR at all — Ollama would have to build it twice. The fragmentation of Ollama's own engine layer is an underrated obstacle to it ever matching vLLM at concurrency.

**The scheduler is still the ceiling.** Remember the MDPI finding: Ollama's bottleneck was its parallel-slot count, not raw KV capacity. Paging raises the memory ceiling; it does nothing about a scheduler that admits ten requests. vLLM's advantage is a *system* — paging + continuous batching + admission control + kernels — and adopting one component doesn't transplant the system.

## 8. So what should you run?

The decision table hasn't changed, and honestly, it may not change even if #22569 merges:

| Your situation | Run | Why |
|---|---|---|
| One user, local machine, Apple Silicon or modest GPU | **Ollama / llama.cpp** | Paging buys ~nothing at low concurrency (~3% in the PR's own numbers); GGUF quantization and low overhead dominate |
| Team-shared endpoint, server GPU, latency SLO | **vLLM** | Paging + continuous batching + admission control as an integrated system; 3–29× depending on load |
| Watching the frontier | **llama.cpp @ #22569** | The 2.5×-at-247-sequences result says local-first engines can close part of the gap — if the maintainers accept the complexity |

Three takeaways:

1. **"vLLM is faster because PagedAttention" is a third of the truth.** Paging makes big batches *possible*; continuous batching *exploits* them; Ollama's slot scheduler is what actually caps it. llama.cpp has had the batching for years — it declined the paging, on purpose, for reasons that were sound for its design center.
2. **The three-year "no" was correct, and so is the 2026 reconsideration.** Single-user inference gains nothing from paging — the PR's own parity numbers prove the maintainers right. What changed is llama.cpp's audience: once `llama-server` became a real multi-user server, the multi-tenant memory problem arrived with it.
3. **Watch #22569, not the benchmarks.** Whether one contested draft PR survives review — "slop" accusation, missing prefix sharing, Metal gap and all — will tell you more about the future of local LLM serving than another vLLM-vs-Ollama shootout.

If you've benchmarked the PR yourself, or you're working on the Metal kernels — I want to compare notes.

---

[^mdpi]: *Applied Sciences* (MDPI), May 2026 — [doi.org/10.3390/app16115435](https://doi.org/10.3390/app16115435). H100 80GB, Qwen3-4B, four scenarios up to 100 concurrent users. Note the FP8 caveat: vLLM ran FP8 native execution; the paper does not ablate its contribution.
[^redhat]: Red Hat Developer, [*Ollama vs vLLM: deep dive performance benchmarking*](https://developers.redhat.com/articles/2025/08/08/ollama-vs-vllm-deep-dive-performance-benchmarking), August 2025. Also observed Ollama throughput flat with `OLLAMA_NUM_PARALLEL=32`.
[^sosp]: Kwon et al., SOSP 2023 — [arxiv.org/abs/2309.06180](https://arxiv.org/abs/2309.06180). Quotes and the 20.4–38.2% / <4% utilization figures are from the paper; the 2–4× result is vs FasterTransformer and Orca, 2023 baselines.
[^4130]: [github.com/ggml-org/llama.cpp/discussions/4130](https://github.com/ggml-org/llama.cpp/discussions/4130) (Gerganov, January 2024) — unified-cache design note, including the cross-sequence attention disadvantage. Fragmentation/defrag: [issue #3380](https://github.com/ggml-org/llama.cpp/issues/3380).
[^1955]: [github.com/ggml-org/llama.cpp/issues/1955](https://github.com/ggml-org/llama.cpp/issues/1955) — all maintainer quotes verified verbatim against the GitHub API; dates 2023-06-21, 2023-06-25, 2025-06-07. JohannesGaessler explicitly noted he spoke for himself, not the project.
[^vattention]: [arxiv.org/abs/2405.04437](https://arxiv.org/abs/2405.04437). See also [arxiv.org/abs/2507.09019](https://arxiv.org/abs/2507.09019) for a methodology critique of the original PagedAttention evaluation (fixed batch-size-8 baselines, MHA-only models).
[^21961]: [github.com/ggml-org/llama.cpp/discussions/21961](https://github.com/ggml-org/llama.cpp/discussions/21961), opened April 15, 2026.
[^22569]: [github.com/ggml-org/llama.cpp/pull/22569](https://github.com/ggml-org/llama.cpp/pull/22569), opened April 30, 2026, draft. Components, numbers, and restrictions as of commit `0b0f7bd7`; a draft PR can be force-pushed or rescoped — verify against head before publish.
