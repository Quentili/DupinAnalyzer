package com.github.quentili.dupinanalyzer.models;

import java.util.List;

public record CreateConfigRequest(
        String name,
        List<ConfigPattern> patterns
) {}