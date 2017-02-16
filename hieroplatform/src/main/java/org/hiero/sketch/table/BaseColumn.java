package org.hiero.sketch.table;

import org.hiero.sketch.table.api.IColumn;

import javax.annotation.Nonnull;
import java.time.Duration;
import java.time.LocalDateTime;

/**
 * Base class for all columns.
 */
abstract class BaseColumn implements IColumn {
    @Nonnull
    final ColumnDescription description;

    BaseColumn(@Nonnull final ColumnDescription description) {
        this.description = description;
    }

    @Nonnull
    @Override
    public ColumnDescription getDescription() {
        return this.description;
    }

    @Override
    public double getDouble(final int rowIndex) {
        throw new UnsupportedOperationException();
    }

    @Override
    public LocalDateTime getDate(final int rowIndex) {
        throw new UnsupportedOperationException();
    }

    @Override
    public int getInt(final int rowIndex) {
        throw new UnsupportedOperationException();
    }

    @Override
    public Duration getDuration(final int rowIndex) {
        throw new UnsupportedOperationException();
    }

    @Override
    public String getString(final int rowIndex) {
        throw new UnsupportedOperationException();
    }

    @Override
    public boolean isMissing(final int rowIndex) { throw new UnsupportedOperationException(); }
}
