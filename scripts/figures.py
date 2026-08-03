"""Draws the dissertation figures as vector PDF.

Run:  python scripts/figures.py
Out:  survey/figures/fig-4-1-study-area.pdf   (and .png)
      survey/figures/fig-4-2-selection.pdf
      survey/figures/fig-4-3-clear-width.pdf

Geometry comes from survey/figure-data.json, whose coordinates are already
metres east and north of the south-west corner of the study area, so the axes
are a plain linear scale and a scale bar is exact.

Every route is distinguished by BOTH colour and line style. On a project about
accessibility it would be a poor joke to encode meaning in hue alone, where
roughly one man in twelve could not read it; the palette is Okabe-Ito, which
stays distinguishable under the common forms of colour blindness, and the line
styles carry the same information again for anyone printing in greyscale.
"""

import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Polygon, Rectangle, Circle, FancyArrow

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "survey" / "figure-data.json").read_text(encoding="utf-8"))
OUT = ROOT / "survey" / "figures"
OUT.mkdir(exist_ok=True)

# Text stays text in the PDF, so it can be searched and stays crisp at any zoom.
plt.rcParams.update({
    "pdf.fonttype": 42,
    "ps.fonttype": 42,
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "font.size": 8,
    "axes.linewidth": 0.6,
})

# Okabe-Ito, chosen for colour-blind safety.
BLUE, ORANGE, GREEN = "#0072B2", "#E69F00", "#009E73"
PURPLE, SKY, VERMILLION = "#CC79A7", "#56B4E9", "#D55E00"

CONTEXT_GREY = "#CFCFCF"
BUILDING_FILL = "#9A9A9A"
BUILDING_EDGE = "#3A3A3A"


def draw_context(ax, lw=0.4):
    """Every mapped path, as a light grey backdrop."""
    for line in DATA["context"]:
        xs = [p[0] for p in line]
        ys = [p[1] for p in line]
        ax.plot(xs, ys, color=CONTEXT_GREY, lw=lw, zorder=1, solid_capstyle="round")


def draw_buildings(ax, label=True):
    for b in DATA["buildings"]:
        ring = b["ring"]
        ax.add_patch(Polygon(ring, closed=True, facecolor=BUILDING_FILL,
                             edgecolor=BUILDING_EDGE, lw=0.7, alpha=0.85, zorder=2))
    if not label:
        return
    for d in DATA["destinations"]:
        x, y = d["at"]
        ax.plot(x, y, marker="o", ms=4.5, mfc="white", mec="black", mew=1.0, zorder=6)
        ax.annotate(d["name"], (x, y), xytext=(0, 9), textcoords="offset points",
                    ha="center", va="bottom", fontsize=7.5, fontweight="bold",
                    zorder=7,
                    bbox=dict(boxstyle="round,pad=0.22", fc="white", ec="none", alpha=0.82))


def scale_bar(ax, x, y, length=100, height=6):
    """A filled/open chequered bar, in data units, so it is exact by construction."""
    half = length / 2
    ax.add_patch(Rectangle((x, y), half, height, facecolor="black", edgecolor="black",
                           lw=0.6, zorder=8))
    ax.add_patch(Rectangle((x + half, y), half, height, facecolor="white", edgecolor="black",
                           lw=0.6, zorder=8))
    for dx, lab in ((0, "0"), (half, str(int(half))), (length, f"{int(length)} m")):
        ax.annotate(lab, (x + dx, y + height + 2), ha="center", va="bottom",
                    fontsize=6.5, zorder=8)


def north_arrow(ax, x, y, size=26):
    ax.add_patch(FancyArrow(x, y, 0, size, width=size * 0.055,
                            head_width=size * 0.3, head_length=size * 0.32,
                            facecolor="black", edgecolor="black", lw=0.4,
                            length_includes_head=True, zorder=8))
    ax.annotate("N", (x, y + size + 3), ha="center", va="bottom",
                fontsize=8, fontweight="bold", zorder=8)


def bbox_frame(ax):
    w, h = DATA["extentM"]["width"], DATA["extentM"]["height"]
    ax.add_patch(Rectangle((0, 0), w, h, fill=False, edgecolor="#555555",
                           lw=0.8, ls=(0, (5, 4)), zorder=3))


def tidy(ax):
    # `box` rather than `datalim`: with `datalim` matplotlib silently widens the
    # limits to satisfy the aspect ratio, which cropped the bounding-box frame
    # off the first draft of Figure 4.1.
    ax.set_aspect("equal", adjustable="box")
    ax.set_xticks([])
    ax.set_yticks([])
    for side in ("top", "right", "bottom", "left"):
        ax.spines[side].set_visible(False)


def offset(points, distance):
    """Shift a polyline sideways by `distance` metres.

    The six journeys share most of their length, so drawn true to position
    they lie on top of one another and only the last one drawn is visible.
    Separating them by a few metres is the usual cartographic answer, and at
    this scale the displacement is smaller than the width of the paths
    themselves. The caption says so.
    """
    n = len(points)
    if n < 2 or distance == 0:
        return points
    out = []
    for i, (x, y) in enumerate(points):
        if i == 0:
            dx, dy = points[1][0] - x, points[1][1] - y
        elif i == n - 1:
            dx, dy = x - points[-2][0], y - points[-2][1]
        else:
            dx, dy = points[i + 1][0] - points[i - 1][0], points[i + 1][1] - points[i - 1][1]
        length = math.hypot(dx, dy)
        if length == 0:
            out.append((x, y))
            continue
        out.append((x - dy / length * distance, y + dx / length * distance))
    return out


# --- Figure 4.1 -------------------------------------------------------

def fig_study_area():
    fig, ax = plt.subplots(figsize=(6.3, 6.4))
    draw_context(ax)
    bbox_frame(ax)
    draw_buildings(ax, label=False)

    # Colour and line style both carry the identity, and the sideways offset
    # keeps journeys that share a corridor from hiding one another.
    styles = [
        (BLUE,       "solid",                     2.1, -7.5),
        (ORANGE,     (0, (6, 2)),                 2.1, -4.5),
        (GREEN,      (0, (1.2, 1.5)),             2.4, -1.5),
        (PURPLE,     (0, (7, 2, 1.5, 2)),         2.1,  1.5),
        (SKY,        (0, (3.5, 1.8)),             2.1,  4.5),
        (VERMILLION, (0, (7, 2, 1.5, 2, 1.5, 2)), 2.1,  7.5),
    ]

    def short(n):
        return (n.replace(" Building", "").replace("University ", "")
                 .replace(" (South)", "").replace(" Museum", ""))

    handles = []
    for j, (colour, dash, lw, shift) in zip(DATA["journeys"], styles):
        line = offset(j["polyline"], shift)
        ax.plot([p[0] for p in line], [p[1] for p in line], color=colour, lw=lw,
                ls=dash, zorder=5, solid_capstyle="round", dash_capstyle="round")
        handles.append(Line2D([], [], color=colour, lw=lw, ls=dash,
                              label=f"{short(j['from'])} – {short(j['to'])}   {j['metres']} m"))

    # Destination markers and labels last, so nothing is drawn over them.
    label_offsets = {
        "Main Building": (-6, -16),
        "Hunterian Museum": (6, 12),
        "University Library": (0, 12),
        "James Watt Building (South)": (0, -16),
    }
    for d in DATA["destinations"]:
        x, y = d["at"]
        ax.plot(x, y, marker="o", ms=5.5, mfc="white", mec="black", mew=1.2, zorder=8)
        dx, dy = label_offsets.get(d["name"], (0, 11))
        ax.annotate(d["name"], (x, y), xytext=(dx, dy), textcoords="offset points",
                    ha="center", va="bottom" if dy > 0 else "top",
                    fontsize=7.6, fontweight="bold", zorder=9,
                    bbox=dict(boxstyle="round,pad=0.24", fc="white", ec="#999999",
                              lw=0.4, alpha=0.92))

    handles.append(Line2D([], [], color=CONTEXT_GREY, lw=1.4,
                          label="Other mapped paths (not surveyed)"))
    handles.append(Line2D([], [], color="#555555", lw=0.9, ls=(0, (5, 4)),
                          label="Download extent"))

    w, h = DATA["extentM"]["width"], DATA["extentM"]["height"]
    scale_bar(ax, 24, 24, length=100)
    north_arrow(ax, w - 34, 30)
    tidy(ax)
    ax.set_xlim(-16, w + 16)
    ax.set_ylim(-16, h + 16)

    # Legend below the map: at this extent it would otherwise sit over the
    # northern half of the study area.
    ax.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, -0.015),
              ncol=2, frameon=False, fontsize=7.2, labelspacing=0.55,
              columnspacing=1.6, handlelength=3.2)

    fig.tight_layout()
    for ext in ("pdf", "png"):
        fig.savefig(OUT / f"fig-4-1-study-area.{ext}", dpi=400, bbox_inches="tight")
    plt.close(fig)
    print("  fig-4-1-study-area.pdf / .png")


# --- Figure 4.2 -------------------------------------------------------

def fig_selection():
    sel = DATA["selection"]
    fig, ax = plt.subplots(figsize=(6.3, 5.6))
    draw_context(ax, lw=0.35)

    for b in DATA["buildings"]:
        ax.add_patch(Polygon(b["ring"], closed=True, facecolor=BUILDING_FILL,
                             edgecolor=BUILDING_EDGE, lw=0.6, alpha=0.6, zorder=2))

    style = {
        "shortest": (BLUE,       "solid",             2.6),
        "stepFree": (VERMILLION, (0, (5, 2)),         2.2),
        "corridor": (ORANGE,     (0, (2.5, 1.8)),     1.6),
        "radius":   (GREEN,      (0, (1, 1.5)),       1.8),
        "link":     (PURPLE,     (0, (6, 2, 1.5, 2)), 1.6),
    }

    handles = []
    xs_all, ys_all = [], []
    for layer in sel["layers"]:
        colour, dash, lw = style[layer["key"]]
        for line in layer["lines"]:
            xs = [p[0] for p in line]
            ys = [p[1] for p in line]
            xs_all += xs
            ys_all += ys
            ax.plot(xs, ys, color=colour, lw=lw, ls=dash, zorder=5,
                    solid_capstyle="round")
        note = (f"{layer['label']} — {layer['count']} segments" if layer["count"]
                else f"{layer['label']} — identical to the shortest path here")
        handles.append(Line2D([], [], color=colour, lw=lw, ls=dash, label=note))

    for pt, name in ((sel["fromAt"], sel["from"]), (sel["toAt"], sel["to"])):
        ax.plot(*pt, marker="o", ms=5, mfc="white", mec="black", mew=1.1, zorder=7)
        ax.annotate(name.replace(" Building", "").replace("University ", ""),
                    pt, xytext=(0, 9), textcoords="offset points", ha="center",
                    fontsize=7.5, fontweight="bold", zorder=8,
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.85))
        xs_all.append(pt[0])
        ys_all.append(pt[1])

    total = sum(l["count"] for l in sel["layers"])
    ax.legend(handles=handles, loc="upper left", frameon=True, framealpha=0.94,
              edgecolor="#BBBBBB", fontsize=6.8, borderpad=0.6, labelspacing=0.5,
              title=f"Selecting what to survey: {sel['from']} → {sel['to']}\n"
                    f"{total} segments selected in total",
              title_fontsize=7.2)

    pad = 70
    x0, x1 = min(xs_all) - pad, max(xs_all) + pad
    y0, y1 = min(ys_all) - pad, max(ys_all) + pad
    scale_bar(ax, x1 - 130, y0 + 14, length=100)
    north_arrow(ax, x1 - 26, y1 - 80)
    tidy(ax)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)

    fig.tight_layout()
    for ext in ("pdf", "png"):
        fig.savefig(OUT / f"fig-4-2-selection.{ext}", dpi=400, bbox_inches="tight")
    plt.close(fig)
    print("  fig-4-2-selection.pdf / .png")


# --- Figure 4.3 -------------------------------------------------------

def fig_clear_width():
    """Schematic only: what 'clear width' means when the footway is obstructed.

    No survey data is involved. The point is the rule the fieldwork followed —
    that the recorded width is the narrowest point, and that street furniture
    counts as the edge of the path — which is faster to show than to describe.
    """
    fig, ax = plt.subplots(figsize=(6.3, 2.5))

    L, W = 100.0, 22.0          # arbitrary drawing units
    PAVING = "#EFEFEF"
    OBSTRUCTION = "#8A8A8A"
    PINCH_X, PINCH_TOP = 62.0, W - 8.0

    ax.add_patch(Rectangle((0, 0), L, W, facecolor=PAVING, edgecolor="none", zorder=1))

    # The band actually left free at the pinch, shaded the whole way along so
    # the eye can see how much of the footway the obstructions remove.
    ax.add_patch(Rectangle((0, 0), L, PINCH_TOP, facecolor="#FBE3D4",
                           edgecolor="none", alpha=0.55, zorder=2))

    ax.plot([0, L], [W, W], color="#333333", lw=1.8, zorder=4)
    ax.plot([0, L], [0, 0], color="#333333", lw=1.8, zorder=4)
    ax.annotate("building line", (0.5, W + 1.2), fontsize=6.8, va="bottom", color="#333333")
    ax.annotate("kerb", (0.5, -1.4), fontsize=6.8, va="top", color="#333333")

    # Obstructions — each one something the survey treated as the path edge.
    ax.add_patch(Circle((30, W - 4.2), 3.8, facecolor=OBSTRUCTION,
                        edgecolor="#333333", lw=0.7, zorder=5))
    ax.annotate("waste bin", (30, W - 0.4), xytext=(0, 15), textcoords="offset points",
                ha="center", fontsize=6.8, zorder=7,
                arrowprops=dict(arrowstyle="-", color="#666666", lw=0.6,
                                shrinkA=0, shrinkB=2))

    for bx in (55.5, 61.0, 66.5):
        ax.add_patch(Rectangle((bx, PINCH_TOP), 3.2, 8.0, facecolor=OBSTRUCTION,
                               edgecolor="#333333", lw=0.6, zorder=5))
    ax.annotate("parked bicycles", (61.0, W - 0.4), xytext=(0, 15),
                textcoords="offset points", ha="center", fontsize=6.8, zorder=7,
                arrowprops=dict(arrowstyle="-", color="#666666", lw=0.6,
                                shrinkA=0, shrinkB=2))

    # Nominal width, taken where nothing happens to be in the way.
    nx = 13.0
    ax.annotate("", (nx, 0), xytext=(nx, W),
                arrowprops=dict(arrowstyle="<->", color=BLUE, lw=1.8, shrinkA=0, shrinkB=0))
    ax.annotate("nominal width\nmeasured clear of\nobstructions", (nx, W / 2),
                xytext=(10, 0), textcoords="offset points", ha="left", va="center",
                fontsize=7.0, color=BLUE, fontweight="bold", zorder=8,
                bbox=dict(boxstyle="round,pad=0.28", fc="white", ec=BLUE, lw=0.5, alpha=0.95))

    # Clear width, at the pinch the bicycles create — the recorded figure.
    ax.plot([PINCH_X, PINCH_X], [PINCH_TOP, W], color=VERMILLION, lw=0.8,
            ls=(0, (2, 2)), zorder=6)
    ax.annotate("", (PINCH_X, 0), xytext=(PINCH_X, PINCH_TOP),
                arrowprops=dict(arrowstyle="<->", color=VERMILLION, lw=2.4,
                                shrinkA=0, shrinkB=0))
    ax.annotate("clear width\nnarrowest point —\nthis is what is recorded", (PINCH_X, PINCH_TOP / 2),
                xytext=(11, 0), textcoords="offset points", ha="left", va="center",
                fontsize=7.0, color=VERMILLION, fontweight="bold", zorder=8,
                bbox=dict(boxstyle="round,pad=0.28", fc="white", ec=VERMILLION,
                          lw=0.5, alpha=0.95))

    ax.annotate("", (L, W + 5.0), xytext=(L - 22, W + 5.0),
                arrowprops=dict(arrowstyle="->", color="#333333", lw=1.0))
    ax.annotate("direction of travel", (L - 11, W + 6.0), ha="center", va="bottom",
                fontsize=6.8, color="#333333")

    ax.set_aspect("equal")
    ax.set_xlim(-3, L + 3)
    ax.set_ylim(-5, W + 13)
    ax.axis("off")

    fig.tight_layout()
    for ext in ("pdf", "png"):
        fig.savefig(OUT / f"fig-4-3-clear-width.{ext}", dpi=400, bbox_inches="tight")
    plt.close(fig)
    print("  fig-4-3-clear-width.pdf / .png")


if __name__ == "__main__":
    print("Writing figures to survey/figures/")
    fig_study_area()
    fig_selection()
    fig_clear_width()
