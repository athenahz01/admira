# Fit Finder Embedding Sanity Report

Model: `Xenova/all-MiniLM-L6-v2`
Dimensions: `384`

This report compares stored school vectors for a few known pairs.

| Pair | Reason | Cosine similarity |
| --- | --- | --- |
| Georgia Institute of Technology-Main Campus to University of Michigan-Ann Arbor | large public research pair | 0.6874 |
| Williams College to Amherst College | liberal arts pair | 0.5707 |
| Massachusetts Institute of Technology to Georgia Institute of Technology-Main Campus | technical research pair | 0.7086 |
| Massachusetts Institute of Technology to The University of Alabama | cross-profile comparison | 0.7590 |
| University of Wisconsin-Madison to The University of Alabama | large public comparison | 0.8157 |

Expected read: similar institutional profiles should generally score higher than cross-profile comparisons.
This is a sanity check, not a quality claim.
