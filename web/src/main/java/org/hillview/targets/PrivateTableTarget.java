package org.hillview.targets;

import org.hillview.*;
import org.hillview.dataStructures.*;
import org.hillview.dataset.ConcurrentPostprocessedSketch;
import org.hillview.dataset.PostProcessedSketch;
import org.hillview.dataset.PrecomputedSketch;
import org.hillview.dataset.api.IDataSet;
import org.hillview.maps.FilterMap;
import org.hillview.maps.ProjectMap;
import org.hillview.sketches.*;
import org.hillview.sketches.results.*;
import org.hillview.table.PrivacySchema;
import org.hillview.table.Schema;
import org.hillview.table.api.ITable;
import org.hillview.table.columns.ColumnQuantization;
import org.hillview.table.filters.RangeFilterDescription;
import org.hillview.table.filters.RangeFilterPairDescription;
import org.hillview.table.rows.RowSnapshot;
import org.hillview.utils.*;

import javax.annotation.Nullable;
import java.util.function.BiFunction;

public class PrivateTableTarget extends RpcTarget implements IPrivateDataset {
    static final long serialVersionUID = 1;

    public final IDataSet<ITable> table;
    public final DPWrapper wrapper;

    PrivateTableTarget(IDataSet<ITable> table, HillviewComputation computation,
                       PrivacySchema privacySchema, String schemaFilename) {
        super(computation);
        this.wrapper = new DPWrapper(privacySchema, schemaFilename);
        this.table = table;
        this.registerObject();
    }

    private PrivateTableTarget(IDataSet<ITable> table,
                               HillviewComputation computation,
                               DPWrapper wrapper) {
        super(computation);
        this.table = table;
        this.wrapper = new DPWrapper(wrapper);
        this.registerObject();
    }

    private PrivacySchema getPrivacySchema() {
        return this.wrapper.getPrivacySchema();
    }

    @HillviewRpc
    public void changePrivacy(RpcRequest request, RpcRequestContext context) {
        this.wrapper.setPrivacySchema(request.parseArgs(PrivacySchema.class));
        HillviewLogger.instance.info("Updated privacy schema");
        PrecomputedSketch<ITable, JsonString> empty =
                new PrecomputedSketch<ITable, JsonString>(new JsonString("{}"));
        this.runCompleteSketch(this.table, empty, request, context);
    }

    @HillviewRpc
    public void savePrivacy(RpcRequest request, RpcRequestContext context) {
        this.wrapper.savePrivacySchema();
        HillviewLogger.instance.info("Saved privacy schema");
        PrecomputedSketch<ITable, JsonString> empty =
                new PrecomputedSketch<ITable, JsonString>(new JsonString("{}"));
        this.runCompleteSketch(this.table, empty, request, context);
    }

    @HillviewRpc
    public void getSummary(RpcRequest request, RpcRequestContext context) {
        SummarySketch ss = new SummarySketch();
        PostProcessedSketch<ITable, TableSummary, DPWrapper.PrivacySummary> post =
                new PostProcessedSketch<ITable, TableSummary, DPWrapper.PrivacySummary>(ss) {
                    @Nullable
                    @Override
                    public DPWrapper.PrivacySummary postProcess(@Nullable TableSummary result) {
                        return PrivateTableTarget.this.wrapper.addPrivateMetadata(result);
                    }
                };
        this.runCompleteSketch(this.table, post, request, context);
    }

    // Returns both the histogram and the precomputed CDF of the data.
    // Each histogram data structure will also contain the corresponding precomputed CDF,
    // but we still compute two of them for one request because the histogram buckets and CDF
    // are computed at different bucket granularities.
    @HillviewRpc
    public void histogramAndCDF(RpcRequest request, RpcRequestContext context) {
        HistogramRequestInfo[] info = request.parseArgs(HistogramRequestInfo[].class);
        assert info.length == 2;
        ColumnQuantization quantization = this.getPrivacySchema().quantization(info[0].cd.name);
        Converters.checkNull(quantization);
        HistogramSketch sk = info[0].getSketch(quantization); // Histogram
        HistogramSketch cdf = info[1].getSketch(quantization);
        IntervalDecomposition d0 = info[0].getDecomposition(quantization);
        IntervalDecomposition d1 = info[1].getDecomposition(quantization);
        double epsilon = this.getPrivacySchema().epsilon(info[0].cd.name);
        DPHistogram privateHisto = new DPHistogram(sk, this.wrapper.getColumnIndex(info[0].cd.name),
                d0, epsilon, false, this.wrapper.laplace);
        DPHistogram privateCdf = new DPHistogram(cdf, this.wrapper.getColumnIndex(info[0].cd.name),
                d1, epsilon, true, this.wrapper.laplace);
        ConcurrentPostprocessedSketch<ITable, Histogram, Histogram, Histogram, Histogram> ccp =
                new ConcurrentPostprocessedSketch<ITable, Histogram, Histogram, Histogram, Histogram>(
                        privateHisto, privateCdf);
        this.runCompleteSketch(this.table, ccp, request, context);
    }

    @SuppressWarnings("unused")
    @HillviewRpc
    public void getDataQuantiles1D(RpcRequest request, RpcRequestContext context) {
        this.wrapper.getDataQuantiles1D(request, context, this);
    }

    @HillviewRpc
    public void filterRange(RpcRequest request, RpcRequestContext context) {
        RangeFilterDescription filter = request.parseArgs(RangeFilterDescription.class);
        FilterMap map = new FilterMap(filter, this.getPrivacySchema().quantization);
        BiFunction<IDataSet<ITable>, HillviewComputation, IRpcTarget> constructor = (e, c) -> {
            PrivateTableTarget result = new PrivateTableTarget(e, c, this.wrapper);
            result.getWrapper().filter(filter);
            return result;
        };
        this.runMap(this.table, map, constructor, request, context);
    }

    @HillviewRpc
    public void filter2DRange(RpcRequest request, RpcRequestContext context) {
        RangeFilterPairDescription filter = request.parseArgs(RangeFilterPairDescription.class);
        FilterMap map = new FilterMap(filter, this.getPrivacySchema().quantization);
        BiFunction<IDataSet<ITable>, HillviewComputation, IRpcTarget> constructor = (e, c) -> {
            PrivateTableTarget result = new PrivateTableTarget(e, c, this.wrapper);
            result.getWrapper().filter(filter.first);
            result.getWrapper().filter(filter.second);
            return result;
        };
        this.runMap(this.table, map, constructor, request, context);
    }

    @HillviewRpc
    public void hLogLog(RpcRequest request, RpcRequestContext context) {
        DistinctCountRequestInfo col = request.parseArgs(DistinctCountRequestInfo.class);
        HLogLogSketch sketch = new HLogLogSketch(col.columnName, col.seed);
        double epsilon = this.wrapper.getPrivacySchema().epsilon(col.columnName);
        Noise noise = DPWrapper.computeCountNoise(this.wrapper.getColumnIndex(col.columnName),
                DPWrapper.SpecialBucket.DistinctCount, epsilon, this.wrapper.laplace);
        NoisyHLogLog nhll = new NoisyHLogLog(sketch, noise);
        this.runCompleteSketch(this.table, nhll, request, context);
    }

    @SuppressWarnings("unused")
    @HillviewRpc
    public void getDataQuantiles3D(RpcRequest request, RpcRequestContext context) {
        this.wrapper.getDataQuantiles3D(request, context, this);
    }

    @SuppressWarnings("unused")
    @HillviewRpc
    public void getDataQuantiles2D(RpcRequest request, RpcRequestContext context) {
        this.wrapper.getDataQuantiles2D(request, context, this);
    }

    @HillviewRpc
    public void heatmap(RpcRequest request, RpcRequestContext context) {
        HistogramRequestInfo[] info = request.parseArgs(HistogramRequestInfo[].class);
        assert info.length == 2;
        ColumnQuantization q0 = this.getPrivacySchema().quantization(info[0].cd.name);
        ColumnQuantization q1 = this.getPrivacySchema().quantization(info[1].cd.name);
        Converters.checkNull(q0);
        Converters.checkNull(q1);
        double epsilon = this.getPrivacySchema().epsilon(info[0].cd.name, info[1].cd.name);
        IHistogramBuckets b0 = info[0].getBuckets(q0);
        IHistogramBuckets b1 = info[1].getBuckets(q1);
        IntervalDecomposition d0 = info[0].getDecomposition(q0);
        IntervalDecomposition d1 = info[1].getDecomposition(q1);
        HeatmapSketch sk = new HeatmapSketch(
                b0, b1, info[0].cd.name, info[1].cd.name, 1.0, 0, q0, q1);
        DPHeatmapSketch hsk = new DPHeatmapSketch(sk,
                this.wrapper.getColumnIndex(info[0].cd.name, info[1].cd.name),
                d0, d1, epsilon, this.wrapper.laplace);
        this.runCompleteSketch(this.table, hsk, request, context);
    }

    @HillviewRpc
    public void getNextK(RpcRequest request, RpcRequestContext context) {
        TableTarget.NextKArgs nextKArgs = request.parseArgs(TableTarget.NextKArgs.class);
        // Only allow this if the sort order is empty
        if (nextKArgs.order.getSize() != 0)
            throw new HillviewException("No column data can be displayed privately");
        RowSnapshot rs = TableTarget.asRowSnapshot(
                nextKArgs.firstRow, nextKArgs.order, nextKArgs.columnsNoValue);
        NextKSketch nk = new NextKSketch(nextKArgs.order, null, rs, nextKArgs.rowsOnScreen,
                this.getPrivacySchema().quantization);
        double epsilon = this.wrapper.getPrivacySchema().epsilon();
        Noise noise = DPWrapper.computeCountNoise(DPWrapper.TABLE_COLUMN_INDEX, // Computed on entire table
                DPWrapper.SpecialBucket.TotalCount, epsilon, this.wrapper.laplace);
        NextKSketchNoisy skn = new NextKSketchNoisy(nk, noise);
        this.runCompleteSketch(this.table, skn, request, context);
    }

    @HillviewRpc
    public void quantile(RpcRequest request, RpcRequestContext context) {
        QuantileInfo info = request.parseArgs(QuantileInfo.class);
        SampleQuantileSketch sk = new SampleQuantileSketch(
                info.order, info.precision, info.tableSize, info.seed,
                this.getPrivacySchema().quantization);
        PostProcessedSketch<ITable, SampleList, RowSnapshot> post =
                new PostProcessedSketch<ITable, SampleList, RowSnapshot>(sk) {
                    @Override
                    public RowSnapshot postProcess(@Nullable SampleList result) {
                        Converters.checkNull(result);
                        return result.getRow(info.position);
                    }
                };
        this.runCompleteSketch(this.table, post, request, context);
    }

    @HillviewRpc
    public void project(RpcRequest request, RpcRequestContext context) {
        Schema proj = request.parseArgs(Schema.class);
        ProjectMap map = new ProjectMap(proj);
        this.runMap(this.table, map, (d, c) -> new PrivateTableTarget(d, c, this.wrapper), request, context);
    }

    @Override
    public IDataSet<ITable> getDataset() {
        return this.table;
    }

    @Override
    public DPWrapper getWrapper() {
        return this.wrapper;
    }
}
