package com.github.quentili.dupinanalyzer.models;

import java.util.List;

public record ConfigResponse(String name, List<ConfigPattern> patterns) {
}
