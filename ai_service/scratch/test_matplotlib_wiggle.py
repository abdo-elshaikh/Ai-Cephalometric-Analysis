import matplotlib.pyplot as plt
import numpy as np

def generate_wiggle_test():
    measurements = [
        {"name": "SNA", "diff": 1.2, "sd": 2.0},
        {"name": "SNB", "diff": -0.8, "sd": 2.0},
        {"name": "ANB", "diff": 2.5, "sd": 1.5},
        {"name": "SN-MP", "diff": 0.5, "sd": 3.0},
    ]
    
    names = [m["name"] for m in measurements]
    deviations = [m["diff"] / m["sd"] for m in measurements]
    
    fig, ax = plt.subplots(figsize=(6, 8))
    
    # Grid
    ax.set_xlim(-3.5, 3.5)
    ax.set_ylim(-1, len(names))
    ax.set_xticks([-3, -2, -1, 0, 1, 2, 3])
    ax.set_xticklabels(["-3σ", "-2σ", "-σ", "m", "σ", "2σ", "3σ"])
    ax.grid(True, axis='x', linestyle='--', alpha=0.7)
    
    # Plot wiggle
    y_pos = np.arange(len(names))
    ax.plot(deviations, y_pos, marker='o', color='red', linewidth=2, markersize=8)
    
    # Labels
    ax.set_yticks(y_pos)
    ax.set_yticklabels(names)
    ax.invert_yaxis()
    
    plt.title("Cephalometric Wiggle Chart (Matplotlib)")
    plt.savefig("wiggle_test.png")
    print("Wiggle chart saved to wiggle_test.png")

if __name__ == "__main__":
    generate_wiggle_test()
