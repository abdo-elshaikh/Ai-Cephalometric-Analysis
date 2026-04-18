import torch

def argsoftmax(x, index, beta=1e-2):
    a = torch.exp(-torch.abs(x - x.max(dim=1).values.unsqueeze(1)) / (beta))
    b = torch.sum(a, dim=1).unsqueeze(1)
    softmax = a / b
    return torch.mm(softmax, index)

def get_heatmap_stats(outputs):
    """
    Extract peak activation values (confidence) and global max locations.
    Returns: (confidences, max_y, max_x)
    """
    batch_size, n_classes, h, w = outputs.shape
    flattened = outputs.view(batch_size, n_classes, -1)
    
    # Peak activation (Confidence)
    max_vals, max_indices = torch.max(flattened, dim=2)
    
    # Convert flat indices back to 2D
    y = max_indices // w
    x = max_indices % w
    
    return max_vals[0], y[0], x[0]