/*
 * Copyright (c) 2017 VMware Inc. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {mouse as d3mouse} from "d3-selection";
import {IViewSerialization, QuantileVectorSerialization} from "../datasetView";
import {
    Histogram,
    IColumnDescription,
    kindIsString,
    QuantilesVector,
    QuantileVectorArgs,
    RecordOrder,
    RemoteObjectId,
} from "../javaBridge";
import {OnCompleteReceiver, Receiver, RpcRequest} from "../rpc";
import {BaseReceiver, TableTargetAPI} from "../tableTarget";
import {IDataView} from "../ui/dataview";
import {DragEventKind, FullPage, PageTitle} from "../ui/fullPage";
import {SubMenu, TopMenu} from "../ui/menu";
import {HtmlPlottingSurface} from "../ui/plottingSurface";
import {TextOverlay} from "../ui/textOverlay";
import {ChartOptions, HtmlString, Resolution} from "../ui/ui";
import {ICancellable, PartialResult, periodicSamples, saveAs, significantDigits,} from "../util";
import {AxisData, AxisKind} from "./axisData";
import {BucketDialog, HistogramViewBase} from "./histogramViewBase";
import {NextKReceiver, TableView} from "./tableView";
import {DataRangesReceiver, FilterReceiver} from "./dataRangesCollectors";
import {DisplayName, SchemaClass} from "../schemaClass";
import {Quartiles2DPlot} from "../ui/quartiles2DPlot";

/**
 * This class is responsible for rendering a vector of quartiles.
 * Each quartile is for a bucket.
 */
export class QuartilesVectorView extends HistogramViewBase {
    protected data: QuantilesVector;
    protected plot: Quartiles2DPlot;
    protected yAxisData: AxisData;

    constructor(remoteObjectId: RemoteObjectId, rowCount: number,
                schema: SchemaClass, protected qCol: IColumnDescription, page: FullPage) {
        super(remoteObjectId, rowCount, schema, page, "QuartileVector");

        this.menu = new TopMenu( [{
           text: "Export",
           help: "Save the information in this view in a local file.",
           subMenu: new SubMenu([{
               text: "As CSV",
               help: "Saves the data in this view in a CSV file.",
               action: () => { this.export(); },
           }]),
        }, {
            text: "View",
            help: "Change the way the data is displayed.",
            subMenu: new SubMenu([{
                text: "refresh",
                action: () => { this.refresh(); },
                help: "Redraw this view",
            }, {
                text: "table",
                action: () => this.showTable(),
                help: "Show the data underlying this plot in a tabular view. ",
            }, {
                text: "heatmap",
                action: () => { this.doHeatmap(); },
                help: "Plot this data as a heatmap view.",
            }, {
                text: "2D histogram",
                action: () => { this.do2DHistogram(); },
                help: "Plot this data as a 2D histogram.",
            }, {
                text: "1D histogram",
                action: () => { this.doHistogram(); },
                help: "Plot the X column as 1 D histogam.",
            }]) },
            page.dataset.combineMenu(this, page.pageId),
        ]);

        this.page.setMenu(this.menu);
    }

    protected showTrellis(colName: DisplayName): void {
        throw new Error("Method not implemented.");
    }

    protected createNewSurfaces(): void {
        if (this.surface != null)
            this.surface.destroy();
        this.surface = new HtmlPlottingSurface(this.chartDiv, this.page, {});
        this.plot = new Quartiles2DPlot(this.surface);
    }

    public getAxisData(event: DragEventKind): AxisData | null {
        switch (event) {
            case "Title":
            case "GAxis":
                return null;
            case "YAxis":
                return this.yAxisData;
            case "XAxis":
                return this.xAxisData;
        }
        return null;
    }

    public updateView(qv: QuantilesVector): void {
        this.createNewSurfaces();
        this.data = qv;

        const bucketCount = this.xAxisData.bucketCount;
        this.plot.setData(qv, 1.0, this.schema, this.rowCount, this.xAxisData, false);
        this.plot.draw();
        this.setupMouse();
        this.yAxisData = new AxisData(this.qCol, this.plot.yDataRange(), 0);
        this.yAxisData.setResolution(this.plot.getChartHeight(), AxisKind.Left, 0);
        this.pointDescription = new TextOverlay(this.surface.getChart(),
            this.surface.getActualChartSize(),
            [this.xAxisData.getDisplayNameString(this.schema), "bucket",
                "max", "q3", "median", "q1", "min", "missing"], 40);
        this.pointDescription.show(false);
        let summary = new HtmlString(String(bucketCount) + " buckets");
        summary.setInnerHtml(this.summary);
    }

    public serialize(): IViewSerialization {
        // noinspection UnnecessaryLocalVariableJS
        const result: QuantileVectorSerialization = {
            ...super.serialize(),
            columnDescription0: this.xAxisData.description,
            columnDescription1: this.qCol,
            xBucketCount: this.xAxisData.bucketCount,
        };
        return result;
    }

    public static reconstruct(ser: QuantileVectorSerialization, page: FullPage): IDataView {
        const cd0: IColumnDescription = ser.columnDescription0;
        const cd1: IColumnDescription = ser.columnDescription1;
        const xPoints: number = ser.xBucketCount;
        const schema: SchemaClass = new SchemaClass([]).deserialize(ser.schema);
        if (cd0 === null || cd1 === null || schema === null ||
            xPoints === null)
            return null;

        const hv = new QuartilesVectorView(ser.remoteObjectId, ser.rowCount, schema, cd1, page);
        hv.setAxis(new AxisData(cd0, null, ser.xBucketCount));
        return hv;
    }

    public setAxis(xAxisData: AxisData): void {
        this.xAxisData = xAxisData;
    }

    public doHeatmap(): void {
        const cds = [this.xAxisData.description, this.qCol];
        const rr = this.createDataQuantilesRequest(cds, this.page, "Heatmap");
        rr.invoke(new DataRangesReceiver(this, this.page, rr, this.schema,
            [0, 0], cds, null, {
            reusePage: false,
            chartKind: "Heatmap",
            exact: true
        }));
    }

    public doHistogram(): void {
        const cds = [this.xAxisData.description];
        const rr = this.createDataQuantilesRequest(cds, this.page, "Histogram");
        rr.invoke(new DataRangesReceiver(this, this.page, rr, this.schema,
            [this.xAxisData.bucketCount], cds, null, {
                reusePage: false,
                chartKind: "Histogram"
            }));
    }

    public do2DHistogram(): void {
        const cds = [this.xAxisData.description, this.qCol];
        const rr = this.createDataQuantilesRequest(cds, this.page, "2DHistogram");
        rr.invoke(new DataRangesReceiver(this, this.page, rr, this.schema,
            [this.xAxisData.bucketCount, 0], cds, null, {
                reusePage: false,
                chartKind: "2DHistogram"
            }));
    }

    public export(): void {
        const lines: string[] = this.asCSV();
        const fileName = "quantiles2d.csv";
        saveAs(fileName, lines.join("\n"));
    }

    /**
     * Convert the data to text.
     * @returns {string[]}  An array of lines describing the data.
     */
    public asCSV(): string[] {
        const lines: string[] = [];
        let line = ",";
        for (let x = 0; x < this.xAxisData.bucketCount; x++) {
            const bx = this.xAxisData.bucketDescription(x, 0);
            const l = JSON.stringify(this.schema.displayName(this.xAxisData.description.name) + " " + bx);
            line += "," + l;
        }
        lines.push(line);

        const data = this.data.data;
        line = "min,";
        for (let x = 0; x < this.xAxisData.bucketCount; x++) {
            line += "," + (data[x].empty) ? "" : data[x].min;
        }
        lines.push(line);

        line = "q1,";
        for (let x = 0; x < this.xAxisData.bucketCount; x++) {
            line += "," + (data[x].empty) ? "" : (data[x].samples.length > 0 ? data[x].samples[0] : "");
        }
        lines.push(line);

        line = "median,";
        for (let x = 0; x < this.xAxisData.bucketCount; x++) {
            line += "," + (data[x].empty) ? "" : (data[x].samples.length > 1 ? data[x].samples[1] : "");
        }
        lines.push(line);

        line = "q3,";
        for (let x = 0; x < this.xAxisData.bucketCount; x++) {
            line += "," + (data[x].empty) ? "" : (data[x].samples.length > 2 ? data[x].samples[2] : "");
        }
        lines.push(line);

        line = "max,";
        for (let x = 0; x < this.xAxisData.bucketCount; x++) {
            line += "," + (data[x].empty) ? "" : data[x].max;
        }
        lines.push(line);

        line = "missing,";
        for (let x = 0; x < this.xAxisData.bucketCount; x++) {
            line += "," + data[x].missing;
        }
        lines.push(line);
        return lines;
    }

    protected getCombineRenderer(title: PageTitle):
        (page: FullPage, operation: ICancellable<RemoteObjectId>) => BaseReceiver {
        return (page: FullPage, operation: ICancellable<RemoteObjectId>) => {
            return new FilterReceiver(title, [this.xAxisData.description, this.qCol],
                this.schema, [0, 0], page, operation, this.dataset, {
                exact: true, chartKind: "QuartileVector",
                reusePage: false
            });
        };
    }

    public changeBuckets(bucketCount: number): void {
        if (bucketCount == null)
            return;
        const cds = [this.xAxisData.description, this.qCol];
        const rr = this.createDataQuantilesRequest(cds, this.page, "QuartileVector");
        rr.invoke(new DataRangesReceiver(this, this.page, rr, this.schema,
            [bucketCount], cds, null, {
            reusePage: true, chartKind: "QuartileVector"
        }));
    }

    public chooseBuckets(): void {
        if (this == null)
            return;
        const bucketDialog = new BucketDialog(this.xAxisData.bucketCount);
        bucketDialog.setAction(() => this.changeBuckets(bucketDialog.getBucketCount()));
        bucketDialog.show();
    }

    public resize(): void {
        if (this == null)
            return;
        this.updateView(this.data);
    }

    public refresh(): void {
        /* TODO */
    }

    public onMouseEnter(): void {
        super.onMouseEnter();
    }

    public onMouseLeave(): void {
        super.onMouseLeave();
    }

    /**
     * Handles mouse movements in the canvas area only.
     */
    public onMouseMove(): void {
        const position = d3mouse(this.surface.getChart().node());
        // note: this position is within the chart
        const mouseX = position[0];
        const mouseY = position[1];

        let xs = "";
        // Use the plot scale, not the yData to invert.  That's the
        // one which is used to draw the axis.
        let bucketDesc = "";
        let min = "", q1 = "", q2 = "", q3 = "", max = "", missing = "";
        if (this.xAxisData.scale != null) {
            xs = this.xAxisData.invert(position[0]);
            if (this.data != null) {
                const bucket = this.plot.getBucketIndex(position[0]);
                if (bucket < 0)
                    return;
                bucketDesc = this.xAxisData.bucketDescription(bucket, 20);
                const qv = this.data.data[bucket];
                min = significantDigits(qv.min);
                max = significantDigits(qv.max);
                q1 = significantDigits(qv.samples[0]);
                q2 = qv.samples.length > 1 ? significantDigits(qv.samples[1]) : q1;
                q3 = qv.samples.length > 2 ? significantDigits(qv.samples[2]) : q2;
                missing = significantDigits(qv.missing);
            }
        }
        this.pointDescription.update([xs, bucketDesc, max, q3, q2, q1, min, missing], mouseX, mouseY);
    }

    protected dragMove(): boolean {
        return this.dragMoveRectangle();
    }

    protected dragEnd(): boolean {
        if (!super.dragEnd())
            return false;
        const position = d3mouse(this.surface.getCanvas().node());
        const x = position[0];
        const y = position[1];
        this.selectionCompleted(this.selectionOrigin.x, x, this.selectionOrigin.y, y);
        return true;
    }

    /**
     * * xl and xr are coordinates of the mouse position within the
     * canvas or legend rectangle respectively.
     */
    protected selectionCompleted(xl: number, xr: number, yl: number, yr: number): void {
        const rr = this.filterSelectionRectangle(xl, xr, yl, yr, this.xAxisData, this.yAxisData);
        if (rr == null)
            return;
        const renderer = new FilterReceiver(
            new PageTitle(this.page.title + " filtered"),
            [this.xAxisData.description, this.qCol], this.schema,
            [0], this.page, rr, this.dataset, {
            chartKind: "QuartileVector", reusePage: false,
        });
        rr.invoke(renderer);
    }

    // show the table corresponding to the data in the histogram
    protected showTable(): void {
        const order =  new RecordOrder([ {
            columnDescription: this.xAxisData.description,
            isAscending: true,
        }, {
            columnDescription: this.qCol,
            isAscending: true,
        } ]);

        const page = this.dataset.newPage(new PageTitle("Table"), this.page);
        const table = new TableView(this.remoteObjectId, this.rowCount, this.schema, page);
        const rr = table.createNextKRequest(order, null, Resolution.tableRowsOnScreen);
        page.setDataView(table);
        rr.invoke(new NextKReceiver(page, table, rr, false, order, null));
    }
}

export class QuartilesVectorReceiver extends Receiver<QuantilesVector> {
    protected view: QuartilesVectorView;

    constructor(title: PageTitle,
                page: FullPage,
                protected remoteObject: TableTargetAPI,
                protected rowCount: number,
                protected schema: SchemaClass,
                protected axis: AxisData,
                protected quantilesCol: IColumnDescription,
                operation: RpcRequest<PartialResult<QuantilesVector>>,
                protected options: ChartOptions) {
        super(options.reusePage ? page : page.dataset.newPage(title, page), operation, "quartiles");
        this.view = new QuartilesVectorView(
            this.remoteObject.remoteObjectId, rowCount, schema, quantilesCol, this.page);
        this.page.setDataView(this.view);
        this.view.setAxis(axis);
    }

    public onNext(value: PartialResult<QuantilesVector>): void {
        super.onNext(value);
        if (value == null)
            return;
        this.view.updateView(value.data);
    }

    public onCompleted(): void {
        super.onCompleted();
        this.view.updateCompleted(this.elapsedMilliseconds());
    }
}

/**
 * This receiver is invoked once we have computed a histogram of the data on one column
 * and we are have all the data needed to compute a quartile vector.
 */
export class QuartilesHistogramReceiver extends OnCompleteReceiver<Histogram> {
    constructor(title: PageTitle, page: FullPage, protected remoteObjectId: RemoteObjectId,
                protected rowCount: number,
                protected schema: SchemaClass, protected qCol: IColumnDescription,
                protected bucketCount: number, protected axisData: AxisData,
                rr: RpcRequest<PartialResult<Histogram>>,
                protected reusePage: boolean) {
        super(page, rr, "quartiles");
    }

    run(value: Histogram): void {
        const args: QuantileVectorArgs = {
            quantileCount: 4,  // we display quartiles
            cd: this.axisData.description,
            seed: 0,  // scan all data
            samplingRate: 1.0,
            bucketCount: this.bucketCount,
            quantilesColumn: this.qCol.name,
            nonNullCounts: value.buckets
        };
        if (kindIsString(this.axisData.description.kind))
            args.leftBoundaries = periodicSamples(this.axisData.dataRange.stringQuantiles, this.bucketCount);
        else {
            args.min = this.axisData.dataRange.min;
            args.max = this.axisData.dataRange.max;
        }

        const title= new PageTitle("Quartiles of " + this.qCol.name + " grouped by " +
            this.schema.displayName(args.cd.name));
        const tt = new TableTargetAPI(this.remoteObjectId)
        const rr = tt.createQuantilesVectorRequest(args);
        rr.invoke(new QuartilesVectorReceiver(title, this.page, tt, this.rowCount,
            this.schema, this.axisData, this.qCol, rr,
            { chartKind: "QuartileVector", reusePage: this.reusePage }));
    }
}
