package org.hillview.sketches.results;

import org.hillview.dataset.PostProcessedSketch;
import org.hillview.sketches.NextKSketch;
import org.hillview.table.api.ITable;
import org.hillview.utils.Noise;
import org.hillview.utils.Utilities;

import javax.annotation.Nullable;

public class NextKSketchNoisy extends PostProcessedSketch<ITable, NextKList, NextKList> {
    private final Noise rowCountNoise;

    public NextKSketchNoisy(NextKSketch sketch, Noise noise) {
        super(sketch);
        this.rowCountNoise = noise;
    }

    @Nullable
    @Override
    public NextKList postProcess(@Nullable NextKList r) {
        if (r == null)
            return r;
        if (r.aggregates != null)
            throw new RuntimeException("Aggregates not supported in private views");
        return new NextKList(
                r.rows, r.aggregates, r.count, r.startPosition,
                r.rowsScanned + Utilities.toLong(this.rowCountNoise.getNoise()));
    }
}
