package com.github.quentili.dupinanalyzer.controllers;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.telegram.telegrambots.client.okhttp.OkHttpTelegramClient;
import org.telegram.telegrambots.longpolling.TelegramBotsLongPollingApplication;
import org.telegram.telegrambots.longpolling.interfaces.LongPollingUpdateConsumer;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.message.Message;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.meta.generics.TelegramClient;

import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class ReportController implements LongPollingUpdateConsumer {
    private final TelegramClient telegramClient;
    private final TelegramBotsLongPollingApplication botsApplication;

    @Value("${telegram.bot.token}")
    private String botToken;

    public ReportController(@Value("${telegram.bot.token}") String botToken) {
        this.botToken = botToken;
        this.telegramClient = new OkHttpTelegramClient(botToken);
        this.botsApplication = new TelegramBotsLongPollingApplication();
    }

    @PostConstruct
    public void init() {
        try {
            botsApplication.registerBot(botToken, this);
        } catch (TelegramApiException e) {
            e.printStackTrace();
        }
    }

    @PreDestroy
    public void cleanup() {
        try {
            botsApplication.stop();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @PostMapping(value = "/report", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<Void> onReport(
            @RequestParam("user_id") long userId,
            @RequestBody byte[] body
    ) {
        InputFile file = new InputFile(new ByteArrayInputStream(body), UUID.randomUUID() + ".tar.zst");

        SendDocument sendDocument = SendDocument.builder()
                .chatId(userId)
                .document(file)
                .build();

        try {
            telegramClient.execute(sendDocument);
        } catch (TelegramApiException e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }

        return ResponseEntity.ok().build();
    }

    @Override
    public void consume(List<Update> updates) {
        for (Update update : updates) {
            handleUpdate(update);
        }
    }

    private void handleUpdate(Update update) {
        if (!update.hasMessage()) return;

        Message message = update.getMessage();
        if (message.hasText() && "/start".equals(message.getText())) {
            long userId = message.getFrom().getId();
            SendMessage msg = SendMessage.builder()
                    .chatId(userId)
                    .text("Your ID: `" + userId + "`\nEnter it in the DupinAnalyzer app")
                    .parseMode("Markdown")
                    .build();

            try {
                telegramClient.execute(msg);
            } catch (TelegramApiException e) {
                e.printStackTrace();
            }
        }
    }
}